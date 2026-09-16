import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CFG } from '../core/config';
import { damp, randRange } from '../core/math';
import { SOLID } from '../world/level';
import type { Level } from '../world/level';
import {
  buildZombieBodyCanvas,
  buildZombieClothCanvas,
  buildZombieFaceCanvas,
  buildZombieSkinCanvas,
} from '../world/textures';
import type { ZombieKind } from '../core/config';

const KIND_STATS: Record<ZombieKind, { health: number; speed: number; damage: number; score: number; color: string; size: number }> = {
  shambler: { health: 100, speed: 1.7, damage: 12, score: 100, color: '#8a7d55', size: 1.0 },
  runner: { health: 60, speed: 3.4, damage: 8, score: 150, color: '#6f5b40', size: 0.85 },
  brute: { health: 300, speed: 1.1, damage: 25, score: 300, color: '#5c5140', size: 1.35 },
};

const GEO = {
  torso: new THREE.BoxGeometry(0.52, 0.62, 0.3),
  head: new THREE.BoxGeometry(0.32, 0.36, 0.32),
  arm: new THREE.BoxGeometry(0.14, 0.62, 0.14),
  leg: new THREE.BoxGeometry(0.17, 0.72, 0.17),
  pad: new THREE.BoxGeometry(0.2, 0.16, 0.2),
  eye: new THREE.SphereGeometry(0.028, 6, 6),
};
GEO.arm.translate(0, -0.28, 0); // pivot at shoulder
GEO.leg.translate(0, -0.34, 0); // pivot at hip

export class Zombie {
  kind: ZombieKind;
  group = new THREE.Group();
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  scoreValue: number;
  radius: number;
  alive = true;
  dying = false;
  dieT = 0;

  private mats: THREE.MeshLambertMaterial[] = [];
  private torso!: THREE.Mesh;
  private head!: THREE.Mesh;
  private armL!: THREE.Group;
  private armR!: THREE.Group;
  private legL!: THREE.Group;
  private legR!: THREE.Group;
  private eyeMat!: THREE.MeshBasicMaterial;
  private rig = new THREE.Group();
  private glbRoot: THREE.Group | null = null;
  private walkPhase = Math.random() * Math.PI * 2;
  private attackTimer = 0;
  private windup = -1;
  private growlTimer: number;
  private wobblePhase: number;
  private h: number;
  private mapW: number;
  private mapH: number;
  private flashT = 0;

  constructor(kind: ZombieKind, levelW: number, levelH: number, uniqueId: number) {
    this.kind = kind;
    const st = KIND_STATS[kind];
    this.maxHealth = st.health;
    this.health = st.health;
    this.speed = st.speed;
    this.damage = st.damage;
    this.scoreValue = st.score;
    this.radius = 0.42 * st.size;
    this.h = 1.75 * st.size;
    this.mapW = levelW;
    this.mapH = levelH;
    this.growlTimer = randRange(2, 8);
    this.wobblePhase = Math.random() * Math.PI * 2;

    this.buildRig(uniqueId, st.color, st.size);
    this.group.add(this.rig);
    this.group.visible = false;
  }

  private lam(color: string | number, map?: THREE.Texture): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color, map, transparent: true });
    this.mats.push(m);
    return m;
  }

  private buildRig(uniqueId: number, kindColor: string, size: number): void {
    const seed = (uniqueId * 2654435761) >>> 0;
    const clothTex = new THREE.CanvasTexture(buildZombieClothCanvas(seed, kindColor));
    clothTex.colorSpace = THREE.SRGBColorSpace;
    const skinTex = new THREE.CanvasTexture(buildZombieSkinCanvas(seed ^ 0x77, '#a89a72'));
    skinTex.colorSpace = THREE.SRGBColorSpace;
    const faceTex = new THREE.CanvasTexture(buildZombieFaceCanvas(seed ^ 0x55, kindColor));
    faceTex.colorSpace = THREE.SRGBColorSpace;
    void buildZombieBodyCanvas;

    const cloth = this.lam('#ffffff', clothTex);
    const skin = this.lam('#ffffff', skinTex);
    const pants = this.lam(this.kind === 'runner' ? '#4a4030' : '#3a3428', clothTex);

    this.torso = new THREE.Mesh(GEO.torso, cloth);
    this.torso.position.y = 1.08;
    this.rig.add(this.torso);

    if (this.kind === 'brute') {
      const padMat = this.lam('#2e2a22');
      for (const s of [-1, 1]) {
        const pad = new THREE.Mesh(GEO.pad, padMat);
        pad.position.set(s * 0.33, 1.36, 0);
        this.rig.add(pad);
      }
    }

    const side = this.lam('#ffffff', skinTex);
    const faceMat = this.lam('#ffffff', faceTex);
    this.head = new THREE.Mesh(GEO.head, [side, side, side, side, faceMat, side]);
    this.mats.push(side, faceMat);
    this.head.position.y = 1.58;
    this.rig.add(this.head);

    this.eyeMat = new THREE.MeshBasicMaterial({ color: this.kind === 'brute' ? 0xff3b1f : 0xffc44d, transparent: true });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(GEO.eye, this.eyeMat);
      e.position.set(s * 0.07, 1.62, 0.17);
      this.rig.add(e);
    }

    const mkArm = (s: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(s * 0.33, 1.34, 0);
      const mesh = new THREE.Mesh(GEO.arm, s < 0 ? cloth : cloth);
      mesh.position.z = 0.02;
      g.add(mesh);
      const hand = new THREE.Mesh(GEO.eye, skin);
      hand.scale.setScalar(2.2);
      hand.position.set(0, -0.6, 0.03);
      g.add(hand);
      g.rotation.x = -1.15;
      g.rotation.z = s * 0.18;
      this.rig.add(g);
      return g;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    const mkLeg = (s: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(s * 0.14, 0.76, 0);
      g.add(new THREE.Mesh(GEO.leg, pants));
      this.rig.add(g);
      return g;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    if (this.kind === 'runner') {
      this.rig.scale.set(0.9, 0.92, 0.9);
      this.torso.rotation.x = 0.18;
    } else if (this.kind === 'brute') {
      this.rig.scale.set(1.28, 1.3, 1.28);
    }
    this.rig.scale.multiplyScalar(size / (this.kind === 'brute' ? 1.3 : this.kind === 'runner' ? 0.9 : 1));
    void skin;
  }

  loadGLB(buffer: ArrayBuffer): void {
    void buffer;
  }

  attachGLB(root: THREE.Group): void {
    if (this.glbRoot) {
      this.group.remove(this.glbRoot);
    }
    this.glbRoot = root;
    this.rig.visible = false;
    this.group.add(root);
  }

  get skinned(): boolean {
    return this.glbRoot !== null;
  }

  spawnAt(x: number, z: number): void {
    this.pos.set(x, 0, z);
    this.alive = true;
    this.dying = false;
    this.dieT = 0;
    this.attackTimer = randRange(0.2, 0.8);
    this.windup = -1;
    this.health = this.maxHealth;
    this.group.visible = true;
    this.group.scale.set(1, 1, 1);
    this.group.rotation.set(0, 0, 0);
    this.group.position.set(x, 0, z);
    this.walkPhase = Math.random() * Math.PI * 2;
    for (const m of this.mats) {
      m.opacity = 1;
      m.emissive.setRGB(0, 0, 0);
    }
    this.eyeMat.opacity = 1;
    this.vel.set(0, 0, 0);
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    level: Level,
    onAttack: (z: Zombie, dmg: number) => void,
    onGrowl: (z: Zombie, dist: number) => void,
  ): void {
    if (this.dying) {
      this.dieT += dt;
      const t = Math.min(1, this.dieT / 0.8);
      this.group.rotation.x = -t * 1.35;
      this.group.position.y = -t * this.h * 0.55;
      const op = 1 - t;
      for (const m of this.mats) m.opacity = op;
      this.eyeMat.opacity = op;
      if (t >= 1) {
        this.alive = false;
        this.group.visible = false;
      }
      return;
    }
    if (!this.alive) return;

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        for (const m of this.mats) m.emissive.setRGB(0, 0, 0);
      }
    }

    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    this.growlTimer -= dt;
    if (this.growlTimer <= 0) {
      this.growlTimer = randRange(3, 9);
      if (dist < 24) onGrowl(this, dist);
    }

    const cell = level.data.cell;
    const cx = Math.floor(this.pos.x / cell);
    const cz = Math.floor(this.pos.z / cell);
    let dirX: number;
    let dirZ: number;

    const direct = new THREE.Vector3(toPlayer.x, 0, toPlayer.z);
    if (direct.lengthSq() > 1e-6) direct.normalize();
    if (dist < 6) {
      dirX = direct.x;
      dirZ = direct.z;
    } else {
      const read = (gx: number, gz: number): number => {
        if (gx < 0 || gz < 0 || gx >= this.mapW || gz >= this.mapH) return -1;
        return level.flow.at(gx, gz);
      };
      const d0 = read(cx, cz);
      if (d0 < 0) {
        dirX = direct.x;
        dirZ = direct.z;
      } else {
        let best = d0;
        let bx = 0;
        let bz = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nd = read(cx + dx, cz + dz);
          if (nd >= 0 && nd < best) {
            best = nd;
            bx = dx;
            bz = dz;
          }
        }
        const tx = (cx + bx) * cell + cell / 2;
        const tz = (cz + bz) * cell + cell / 2;
        const to = new THREE.Vector3(tx - this.pos.x, 0, tz - this.pos.z);
        if (to.lengthSq() > 1e-6) to.normalize();
        dirX = to.x;
        dirZ = to.z;
      }
    }

    const nx = this.pos.x + dirX * this.speed * dt;
    const nz = this.pos.z + dirZ * this.speed * dt;
    if (!this.blocked(nx, this.pos.z, level)) this.pos.x = nx;
    if (!this.blocked(this.pos.x, nz, level)) this.pos.z = nz;

    this.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

    this.walkPhase += dt * (2.2 + this.speed * 2.4);
    const sw = Math.sin(this.walkPhase);
    const sw2 = Math.sin(this.walkPhase + Math.PI);
    const wobble = Math.sin(this.walkPhase * 0.5 + this.wobblePhase);
    this.legL.rotation.x = sw * 0.55;
    this.legR.rotation.x = sw2 * 0.55;
    const reach = this.windup >= 0 ? -1.6 : -1.15;
    this.armL.rotation.x = damp(this.armL.rotation.x, reach + sw * 0.22, 10, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, reach + sw2 * 0.22, 10, dt);
    this.torso.rotation.z = wobble * 0.07;
    this.torso.rotation.y = wobble * 0.1;
    this.head.rotation.z = wobble * 0.12;
    this.head.rotation.x = Math.abs(sw) * 0.08;
    this.group.position.set(this.pos.x, Math.abs(sw) * 0.04, this.pos.z);

    this.attackTimer -= dt;
    const inRange = dist < CFG.zombie.attackRange + this.radius;
    if (inRange && this.windup < 0 && this.attackTimer <= 0) {
      this.windup = CFG.zombie.attackWindup;
    }
    if (this.windup >= 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        this.windup = -1;
        if (dist < CFG.zombie.attackRange + this.radius + 0.25) {
          onAttack(this, this.damage);
        }
        this.attackTimer = CFG.zombie.attackCd;
      }
    }
  }

  private blocked(x: number, z: number, level: Level): boolean {
    const cell = level.data.cell;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    if (cx < 0 || cz < 0 || cx >= level.data.w || cz >= level.data.h) return true;
    return level.data.grid[cz * level.data.w + cx] === SOLID;
  }

  hit(dmg: number): boolean {
    if (!this.alive || this.dying) return false;
    this.health -= dmg;
    for (const m of this.mats) m.emissive.setRGB(1.4, 0.35, 0.2);
    this.flashT = 0.09;
    if (this.glbRoot) {
      this.glbRoot.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (mat && 'emissive' in mat) (mat.emissive as THREE.Color).setRGB(0.9, 0.2, 0.12);
      });
      setTimeout(() => {
        if (!this.glbRoot) return;
        this.glbRoot.traverse((o) => {
          const mesh = o as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (mat && 'emissive' in mat) (mat.emissive as THREE.Color).setRGB(0, 0, 0);
        });
      }, 80);
    }
    if (this.health <= 0) {
      this.dying = true;
      this.dieT = 0;
      return true;
    }
    return false;
  }

  dispose(): void {
    for (const m of this.mats) {
      m.map?.dispose();
      m.dispose();
    }
    this.eyeMat.dispose();
  }
}

export class ZombiePool {
  items: Zombie[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, poolSize = 42) {
    this.scene = scene;
    for (let i = 0; i < poolSize; i++) {
      const kindCycle = (['shambler', 'runner', 'brute'] as const)[i % 3];
      const z = new Zombie(kindCycle, CFG.world.mapW, CFG.world.mapH, i + 1);
      this.items.push(z);
      scene.add(z.group);
      z.group.visible = false;
    }
  }

  async loadModels(getModel: (key: string) => ArrayBuffer | undefined): Promise<void> {
    const loader = new GLTFLoader();
    const parse = (buf: ArrayBuffer): Promise<THREE.Group> =>
      new Promise((resolve, reject) => {
        loader.parse(
          buf.slice(0),
          '',
          (gltf) => resolve(gltf.scene as THREE.Group),
          reject,
        );
      });
    for (const z of this.items) {
      const key = `zombie_${z.kind}`;
      const buf = getModel(key);
      if (!buf || z.skinned) continue;
      try {
        const root = await parse(buf);
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = false;
            mesh.frustumCulled = false;
          }
        });
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const s = 1.7 / Math.max(size.y, 0.001);
        root.scale.setScalar(s);
        z.attachGLB(root);
      } catch {
      }
    }
  }

  acquire(kind: ZombieKind): Zombie | null {
    const z = this.items.find((it) => it.kind === kind && !it.group.visible);
    return z ?? null;
  }

  releaseAll(): void {
    for (const z of this.items) {
      z.alive = false;
      z.dying = false;
      z.group.visible = false;
    }
  }

  get active(): Zombie[] {
    return this.items.filter((z) => z.group.visible && z.alive && !z.dying);
  }

  dispose(): void {
    this.items.forEach((z) => {
      this.scene.remove(z.group);
      z.dispose();
    });
    this.items = [];
  }
}
