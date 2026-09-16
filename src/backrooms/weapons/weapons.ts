import * as THREE from 'three';
import { CFG } from '../core/config';
import { damp, randRange } from '../core/math';
import type { ZombiePool } from '../entities/zombie';
import type { AudioEngine } from '../audio/engine';
import { buildGLBViewModel } from './viewmodels';

export type WeaponSpec = {
  name: string;
  audio: 'pistol' | 'smg' | 'shotgun';
  modelKey: string;
  damage: number;
  pellets: number;
  spread: number;
  rpm: number;
  magSize: number;
  reloadTime: number;
  auto: boolean;
  recoilKick: number;
  recoilSnap: number;
  range: number;
  color: number;
};

export const WEAPONS: WeaponSpec[] = [
  {
    name: 'M1911',
    audio: 'pistol',
    modelKey: 'pistol',
    damage: 34,
    pellets: 1,
    spread: 0.008,
    rpm: 260,
    magSize: 12,
    reloadTime: 1.25,
    auto: false,
    recoilKick: 0.030,
    recoilSnap: 11,
    range: 60,
    color: 0x3a3a40,
  },
  {
    name: 'MAC-11',
    audio: 'smg',
    modelKey: 'smg',
    damage: 16,
    pellets: 1,
    spread: 0.030,
    rpm: 900,
    magSize: 32,
    reloadTime: 1.7,
    auto: true,
    recoilKick: 0.012,
    recoilSnap: 13,
    range: 45,
    color: 0x2c2c30,
  },
  {
    name: 'SPAS-12',
    audio: 'shotgun',
    modelKey: 'ar',
    damage: 15,
    pellets: 8,
    spread: 0.075,
    rpm: 75,
    magSize: 6,
    reloadTime: 2.3,
    auto: false,
    recoilKick: 0.070,
    recoilSnap: 9,
    range: 26,
    color: 0x23252a,
  },
];

type Slot = {
  spec: WeaponSpec;
  ammo: number;
  cooldown: number;
  reloading: number;
};

export class WeaponSystem {
  private camera: THREE.PerspectiveCamera;
  private slots: Slot[];
  private vms: THREE.Group[] = [];
  private muzzles: THREE.Vector3[] = [];
  private idx = 0;
  private swayT = 0;
  private static readonly VM_BASE = new THREE.Vector3(0.22, -0.2, -0.45);

  private kickZ = 0;
  private pitchOff = 0;
  private yawOff = 0;

  private flash: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private flashT = 0;
  private flashDur = 0.055;

  onShoot: ((spec: WeaponSpec) => void) | null = null;
  onDryFire: (() => void) | null = null;
  onHit: ((zombieHit: boolean, killed: boolean, headshot: boolean, point: THREE.Vector3, scoreValue: number) => void) | null = null;
  onAmmoChange: ((idx: number, ammo: number, reloading: boolean) => void) | null = null;
  onSwitch: ((idx: number) => void) | null = null;

  private solidLookup: ((x: number, z: number) => boolean) | null = null;
  private audio: AudioEngine;

  constructor(camera: THREE.PerspectiveCamera, _scene: THREE.Scene, audio: AudioEngine) {
    this.camera = camera;
    this.audio = audio;
    this.slots = WEAPONS.map((spec) => ({ spec, ammo: spec.magSize, cooldown: 0, reloading: 0 }));

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flash.position.set(0.22, -0.18, -0.75);
    camera.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffc973, 0, 9, 2);
    this.flashLight.position.set(0.22, -0.15, -0.7);
    camera.add(this.flashLight);

    for (const _s of this.slots) {
      const { group, muzzleLocal } = { group: new THREE.Group(), muzzleLocal: new THREE.Vector3(0, 0.02, -0.3) };
      group.visible = false;
      group.position.copy(WeaponSystem.VM_BASE);
      camera.add(group);
      this.vms.push(group);
      this.muzzles.push(muzzleLocal.clone());
    }
    this.vms[0].visible = true;
    this.updateFlashPosition();
  }

  async loadViewModels(getModel: (key: string) => ArrayBuffer | undefined): Promise<void> {
    const loaded: { group: THREE.Group; muzzleLocal: THREE.Vector3 }[] = [];
    for (const s of this.slots) {
      loaded.push(await buildGLBViewModel(s.spec.modelKey, getModel(s.spec.modelKey), s.spec));
    }
    for (let i = 0; i < this.vms.length; i++) {
      this.camera.remove(this.vms[i]);
      const vm = loaded[i].group;
      vm.visible = i === this.idx;
      vm.position.copy(WeaponSystem.VM_BASE);
      vm.rotation.set(0, 0, 0);
      this.camera.add(vm);
      this.vms[i] = vm;
      this.muzzles[i] = loaded[i].muzzleLocal.clone();
    }
    this.updateFlashPosition();
  }

  get current(): Slot {
    return this.slots[this.idx];
  }

  get currentIndex(): number {
    return this.idx;
  }

  switchTo(idx: number): void {
    if (idx === this.idx || idx < 0 || idx >= this.slots.length) return;
    this.cancelReload();
    this.idx = idx;
    this.vms.forEach((vm, i) => (vm.visible = i === idx));
    this.kickZ = 0.12; // raise anim
    this.updateFlashPosition();
    this.onSwitch?.(idx);
    this.audio.weaponSwitch();
    this.audio.raise(this.slots[idx].spec.audio);
    this.onAmmoChange?.(idx, this.slots[idx].ammo, false);
  }

  cycle(dir: number): void {
    this.switchTo((this.idx + dir + this.slots.length) % this.slots.length);
  }

  reload(): void {
    const s = this.current;
    if (s.reloading > 0 || s.ammo === s.spec.magSize) return;
    s.reloading = s.spec.reloadTime;
    this.audio.reload(s.spec.audio);
    this.onAmmoChange?.(this.idx, s.ammo, true);
  }

  private cancelReload(): void {
    this.current.reloading = 0;
  }

  private finishReload(): void {
    const s = this.current;
    s.ammo = s.spec.magSize;
    this.onAmmoChange?.(this.idx, s.ammo, false);
  }

  tryFire(origin: THREE.Vector3, dir: THREE.Vector3, zombies: ZombiePool): void {
    const s = this.current;
    if (s.cooldown > 0 || s.reloading > 0) return;
    if (s.ammo <= 0) {
      s.cooldown = 0.3;
      this.onDryFire?.();
      return;
    }
    s.ammo--;
    s.cooldown = 60 / s.spec.rpm;
    this.onShoot?.(s.spec);
    this.onAmmoChange?.(this.idx, s.ammo, false);

    this.kickZ += s.spec.recoilKick * 2.2;
    this.pitchOff += s.spec.recoilKick * 0.55;
    this.yawOff += randRange(-1, 1) * s.spec.recoilKick * 0.12;
    this.flashDur = s.spec.audio === 'shotgun' ? 0.09 : s.spec.audio === 'smg' ? 0.045 : 0.06;
    this.flashT = this.flashDur;
    const flashScale = s.spec.audio === 'shotgun' ? 0.42 : s.spec.audio === 'smg' ? 0.24 : 0.3;
    this.flash.scale.setScalar(flashScale);

    const ray = new THREE.Raycaster();
    ray.far = s.spec.range;
    let anyHit = false;
    let anyKill = false;
    let anyHead = false;

    for (let p = 0; p < s.spec.pellets; p++) {
      const d = dir.clone();
      if (s.spec.spread > 0) {
        const a = randRange(0, Math.PI * 2);
        const r = Math.sqrt(Math.random()) * s.spec.spread;
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(d, up).normalize();
        const realUp = new THREE.Vector3().crossVectors(right, d).normalize();
        d.addScaledVector(right, Math.cos(a) * r).addScaledVector(realUp, Math.sin(a) * r).normalize();
      }
      ray.set(origin, d);

      let bestT = Infinity;
      let bestZombie = null as (typeof zombies.items)[number] | null;
      let head = false;
      for (const z of zombies.active) {
        const sizeScale = z.radius / 0.42;
        const headC = new THREE.Vector3(z.pos.x, z.group.position.y + 1.42 * sizeScale, z.pos.z);
        const hitHead = ray.ray.intersectSphere(new THREE.Sphere(headC, 0.26 * sizeScale), new THREE.Vector3());
        if (hitHead) {
          const t = hitHead.distanceTo(origin);
          if (t < bestT) {
            bestT = t;
            bestZombie = z;
            head = true;
          }
        }
        const bodyC = new THREE.Vector3(z.pos.x, z.group.position.y + 0.8 * sizeScale, z.pos.z);
        const hitBody = ray.ray.intersectSphere(new THREE.Sphere(bodyC, 0.55 * sizeScale), new THREE.Vector3());
        if (hitBody) {
          const t = hitBody.distanceTo(origin);
          if (t < bestT) {
            bestT = t;
            bestZombie = z;
            head = false;
          }
        }
      }

      const cell = 4;
      const step = 0.25;
      let wallT = s.spec.range;
      for (let t = step; t < s.spec.range; t += step) {
        const px = origin.x + d.x * t;
        const py = origin.y + d.y * t;
        const pz = origin.z + d.z * t;
        if (py < 0 || py > CFG.world.wallH) {
          wallT = t;
          break;
        }
        const cx = Math.floor(px / cell);
        const cz = Math.floor(pz / cell);
        if (cx < 0 || cz < 0 || cx >= CFG.world.mapW || cz >= CFG.world.mapH || this.isSolidCell(cx, cz)) {
          wallT = t;
          break;
        }
      }

      if (bestZombie && bestT < wallT) {
        const killed = bestZombie.hit(s.spec.damage * (head ? CFG.weapon.headshotMult : 1));
        anyHit = true;
        anyHead = anyHead || head;
        anyKill = anyKill || killed;
        const hp = new THREE.Vector3(bestZombie.pos.x, 1.1, bestZombie.pos.z);
        this.onHit?.(true, killed, head, hp, killed ? bestZombie.scoreValue : 0);
      } else {
        const hp = new THREE.Vector3().copy(origin).addScaledVector(d, Math.min(wallT, s.spec.range));
        this.onHit?.(false, false, false, hp, 0);
      }
    }
    void anyKill;
    if (anyHit) {
    }
  }

  setSolidityTest(fn: (x: number, z: number) => boolean): void {
    this.solidLookup = fn;
  }
  private isSolidCell(cx: number, cz: number): boolean {
    return this.solidLookup ? this.solidLookup(cx, cz) : false;
  }

  update(dt: number, movingSpeed: number, sprinting: boolean): void {
    const s = this.current;
    if (s.cooldown > 0) s.cooldown -= dt;
    if (s.reloading > 0) {
      s.reloading -= dt;
      if (s.reloading <= 0) this.finishReload();
    }

    this.swayT += dt * (sprinting ? 11 : 7);
    const vm = this.vms[this.idx];
    const bobX = Math.cos(this.swayT) * 0.006 * Math.min(1, movingSpeed / 4);
    const bobY = Math.sin(this.swayT * 2) * 0.005 * Math.min(1, movingSpeed / 4);

    let reloadDip = 0;
    let reloadTilt = 0;
    if (s.reloading > 0) {
      const t = 1 - s.reloading / s.spec.reloadTime;
      reloadDip = Math.sin(t * Math.PI) * 0.18;
      reloadTilt = Math.sin(t * Math.PI) * 0.7;
    }

    vm.position.set(
      WeaponSystem.VM_BASE.x + bobX,
      WeaponSystem.VM_BASE.y + bobY - reloadDip,
      WeaponSystem.VM_BASE.z + this.kickZ,
    );
    vm.rotation.set(this.pitchOff * 2 + reloadTilt, this.yawOff * 3, reloadTilt * 0.4);
    this.updateFlashPosition();

    this.kickZ = damp(this.kickZ, 0, s.spec.recoilSnap, dt);
    this.pitchOff = damp(this.pitchOff, 0, 9, dt);
    this.yawOff = damp(this.yawOff, 0, 9, dt);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const m = this.flash.material as THREE.MeshBasicMaterial;
      const k = Math.max(0, this.flashT / this.flashDur);
      m.opacity = k;
      this.flash.rotation.z = Math.random() * Math.PI;
      const boost = this.current.spec.audio === 'shotgun' ? 40 : 26;
      this.flashLight.intensity = boost * k;
    } else {
      (this.flash.material as THREE.MeshBasicMaterial).opacity = 0;
      this.flashLight.intensity = 0;
    }
  }

  getMuzzleWorld(target = new THREE.Vector3()): THREE.Vector3 {
    target.copy(this.flash.position);
    return this.camera.localToWorld(target);
  }

  get recoilPitch(): number {
    return this.pitchOff;
  }

  get reloading(): boolean {
    return this.current.reloading > 0;
  }

  reset(): void {
    for (const s of this.slots) {
      s.ammo = s.spec.magSize;
      s.cooldown = 0;
      s.reloading = 0;
    }
    this.switchToSilent(0);
    this.onAmmoChange?.(0, this.slots[0].ammo, false);
  }

  private switchToSilent(idx: number): void {
    this.idx = idx;
    this.vms.forEach((vm, i) => (vm.visible = i === idx));
    this.updateFlashPosition();
  }

  private updateFlashPosition(): void {
    const vm = this.vms[this.idx];
    const m = this.muzzles[this.idx];
    if (!vm || !m) return;
    const tip = m.clone().applyQuaternion(vm.quaternion);
    this.flash.position.copy(vm.position).add(tip);
    this.flashLight.position.copy(this.flash.position);
  }

  dispose(): void {
    this.vms.forEach((vm) => {
      vm.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
      this.camera.remove(vm);
    });
    this.camera.remove(this.flash);
    this.camera.remove(this.flashLight);
  }
}
