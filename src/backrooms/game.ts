import * as THREE from 'three';
import { CFG } from './core/config';
import { Input } from './core/input';
import { Player } from './core/player';
import { Level } from './world/level';
import { AudioEngine } from './audio/engine';
import { ZombiePool } from './entities/zombie';
import { WeaponSystem } from './weapons/weapons';
import { FXSystem } from './fx/fx';
import { PostFX } from './fx/postfx';
import { UI, type Stats } from './ui/ui';
import { Minimap } from './ui/minimap';
import { randRange } from './core/math';
import { AssetStore } from './assets/assets';
import type { LoadProgress } from './assets/assets';

type GameState = 'menu' | 'playing' | 'paused' | 'dead' | 'won';

/** Final run result, emitted once per run via GameOptions.onEnd. */
export type RunResult = Stats & { won: boolean };

export type GameOptions = {
  /** Maze seed — same seed ⇒ identical maze. Defaults to random. */
  seed?: number;
  /** Called once when a run ends (death or escape). */
  onEnd?: (result: RunResult) => void;
};

const WAVES: { count: number; runnerChance: number; bruteChance: number }[] = [
  { count: 8, runnerChance: 0.0, bruteChance: 0.0 },
  { count: 12, runnerChance: 0.2, bruteChance: 0.0 },
  { count: 16, runnerChance: 0.3, bruteChance: 0.08 },
  { count: 20, runnerChance: 0.35, bruteChance: 0.14 },
  { count: 26, runnerChance: 0.42, bruteChance: 0.2 },
  { count: 32, runnerChance: 0.5, bruteChance: 0.25 },
];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private input: Input;
  private audio = new AudioEngine();
  private assets = new AssetStore(this.audio.ctx!);
  private level: Level;
  private player = new Player();
  private zombies: ZombiePool;
  private weapons: WeaponSystem;
  private fx: FXSystem;
  private post: PostFX;
  private ui: UI;
  private minimap: Minimap;

  private state: GameState = 'menu';
  private clock = new THREE.Clock();
  private time = 0;
  private runTime = 0;

  // waves
  private wave = 0;
  private waveSpawnQueue = 0;
  private spawnTimer = 0;
  private waveBreak = 0;

  // escape mechanic
  private escapeOpen = false;
  private escapeHold = 0;
  private escapeHoldNeeded = 3.0;
  private escapeUnlockedByWave = 5; // after clearing wave 5, exit opens

  // stats
  private stats: Stats = { score: 0, kills: 0, headshots: 0, wave: 1, accuracy: 0, timeSurvived: 0 };
  private shotsFired = 0;
  private shotsHit = 0;
  // camera kick on shoot (decays fast)
  private shake = 0;

  private rafId = 0;
  private seed: number;

  constructor(
    private container: HTMLElement,
    private opts: GameOptions = {},
  ) {
    this.seed = Math.floor(
      opts.seed ?? (1337 + Math.random() * 100000),
    );
    // renderer — sized to the container, not the window (embeddable)
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const cw = container.clientWidth || window.innerWidth;
    const ch = container.clientHeight || window.innerHeight;
    this.renderer.setSize(cw, ch);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // camera + fog
    this.camera = new THREE.PerspectiveCamera(75, cw / ch, 0.05, 120);
    this.scene.fog = new THREE.FogExp2(0x141006, 0.055);
    this.scene.background = new THREE.Color(0x050403);
    this.scene.add(this.camera);

    // ambient fill so darkness isn't pure black
    const amb = new THREE.AmbientLight(0xbfa759, 0.32);
    const hemi = new THREE.HemisphereLight(0xd8c56a, 0x4a3f22, 0.35);
    this.scene.add(amb, hemi);

    // input
    this.input = new Input(this.renderer.domElement);

    // world
    this.level = new Level(this.renderer);
    this.level.generate(this.seed);
    this.scene.add(this.level.group);
    this.weapons = new WeaponSystem(this.camera, this.scene, this.audio);
    this.weapons.setSolidityTest((cx, cz) => {
      const { grid, w, h } = this.level.data;
      if (cx < 0 || cz < 0 || cx >= w || cz >= h) return true;
      return grid[cz * w + cx] === 1;
    });

    // entities & fx
    this.zombies = new ZombiePool(this.scene, 42);
    this.fx = new FXSystem(this.scene);
    this.post = new PostFX(this.renderer, this.scene, this.camera);

    // give the synth engine access to real CC0 samples
    this.audio.assets = this.assets;

    // spawn player
    const sp = this.level.data.spawnCell;
    this.player.spawnAt(sp.x * CFG.world.cell + CFG.world.cell / 2, sp.z * CFG.world.cell + CFG.world.cell / 2);
    this.player.onFootstep = (s) => this.audio.footstep(s);
    this.player.onHurt = () => {
      this.audio.playerHurt();
      this.ui.damageFlash();
    };

    // ui
    this.ui = new UI(container, {
      onStart: () => void this.startRun(),
      onResume: () => this.resume(),
      onRestart: () => {
        this.resetRun();
        void this.startRun();
      },
      onQuit: () => this.toMenu(),
      onSettings: (s) => {
        this.player.sens = s.sens;
        this.audio.setVolume(s.vol);
        this.fxEnabled = s.fx;
      },
    });
    this.minimap = new Minimap(this.ui.minimap);
    this.minimap.reset(this.level.data.w, this.level.data.h);

    // weapons callbacks
    this.weapons.onShoot = (spec) => {
      this.audio.gunshot(spec.audio);
      this.shotsFired++;
      // world-space gunfeel: muzzle blast + shell + camera kick
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      const muzzle = this.weapons.getMuzzleWorld();
      this.fx.muzzle(muzzle, fwd, spec.audio);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this.fx.shell(this.camera.getWorldPosition(new THREE.Vector3()), right);
      this.shake = Math.min(0.05, this.shake + spec.recoilKick * 0.55);
    };
    this.weapons.onDryFire = () => this.audio.dryFire();
    this.weapons.onHit = (zombieHit, killed, headshot, point, scoreValue) => {
      // tracer from the barrel tip to the impact point
      const muzzle = this.weapons.getMuzzleWorld();
      this.fx.tracer(muzzle, point, this.weapons.current.spec.audio);
      if (zombieHit) {
        this.shotsHit++;
        this.ui.hitmarker(headshot);
        this.audio.hitFlesh();
        if (headshot) this.audio.headshotDing();
        this.fx.impact(point, 'flesh', headshot);
        if (killed) {
          this.audio.zombieDeath();
          this.fx.gib(point, 24);
          this.stats.kills++;
          if (headshot) this.stats.headshots++;
          this.stats.score += scoreValue;
        }
      } else {
        this.audio.hitWall();
        this.fx.impact(point, 'wall');
      }
    };
    this.weapons.onAmmoChange = (idx, ammo, reloading) => {
      const spec = this.weapons.current.spec;
      void idx;
      this.ui.setAmmo(ammo, spec.magSize, spec.name, reloading);
    };

    // lock/unlock
    this.input.onLockChange = (locked) => {
      if (locked) {
        if (this.state === 'menu' || this.state === 'paused') {
          // re-entering play from pause via click
          if (this.state === 'paused') this.resume();
        }
      } else {
        if (this.state === 'playing') this.pause();
      }
    };

    window.addEventListener('resize', this.onResize);

    this.loop();
  }

  /** Keep the canvas fitted to the embed container. */
  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
  };

  private fxEnabled = true;

  /** Load CC0 samples + GLB viewmodels; menu stays interactive meanwhile. */
  async loadAssets(onProgress: LoadProgress): Promise<void> {
    await this.assets.loadAll(onProgress);
    await this.weapons.loadViewModels((k) => this.assets.models[k]);
    // optional CC0 zombie skins — silent fallback to procedural rig
    await this.zombies.loadModels((k) => this.assets.models[k]).catch(() => {});
  }

  // ---------------- state transitions ----------------

  private async startRun(): Promise<void> {
    this.input.requestLock();
    // never block the run on audio — it may be suspended until a real gesture
    this.audio.resume().catch(() => {});
    this.audio.uiConfirm();
    this.state = 'playing';
    this.ui.show('none');
    this.ui.setHudVisible(true);
    this.startWave(1);
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.show('pause');
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.show('none');
    this.input.requestLock();
  }

  private toMenu(): void {
    this.state = 'menu';
    this.zombies.releaseAll();
    this.fx.clear();
    this.ui.setHudVisible(false);
    this.ui.show('main');
  }

  private resetRun(): void {
    // regenerate the whole level for a fresh layout (same seed ⇒ same maze)
    this.scene.remove(this.level.group);
    this.level = new Level(this.renderer);
    this.level.generate(this.seed);
    this.scene.add(this.level.group);
    this.minimap.reset(this.level.data.w, this.level.data.h);

    const sp = this.level.data.spawnCell;
    this.player.spawnAt(sp.x * CFG.world.cell + CFG.world.cell / 2, sp.z * CFG.world.cell + CFG.world.cell / 2);

    this.zombies.releaseAll();
    this.fx.clear();
    this.weapons.reset();

    this.stats = { score: 0, kills: 0, headshots: 0, wave: 1, accuracy: 0, timeSurvived: 0 };
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.runTime = 0;
    this.escapeOpen = false;
    this.escapeHold = 0;
    this.wave = 0;
    this.waveSpawnQueue = 0;
    this.waveBreak = 0;
  }

  // ---------------- waves ----------------

  private startWave(n: number): void {
    this.wave = n;
    const spec = WAVES[Math.min(n - 1, WAVES.length - 1)];
    this.waveSpawnQueue = spec.count;
    this.spawnTimer = 1.2;
    this.audio.waveStart();
    this.audio.setTension(n / WAVES.length);
    this.post.setTension(n / WAVES.length);
    this.ui.showBanner(`WAVE ${n}`, n === WAVES.length ? 'FINAL WAVE — SURVIVE' : 'THE HUM GROWS LOUDER');
  }

  private pickKind(): 'shambler' | 'runner' | 'brute' {
    const spec = WAVES[Math.min(this.wave - 1, WAVES.length - 1)];
    const r = Math.random();
    if (r < spec.bruteChance) return 'brute';
    if (r < spec.bruteChance + spec.runnerChance) return 'runner';
    return 'shambler';
  }

  private spawnZombie(): void {
    const kind = this.pickKind();
    const z = this.zombies.acquire(kind);
    if (!z) return;
    // spawn far from player but on floor
    const cell = CFG.world.cell;
    const { grid, w, h } = this.level.data;
    const pcell = this.player.pos;
    for (let tries = 0; tries < 40; tries++) {
      const gx = Math.floor(Math.random() * w);
      const gz = Math.floor(Math.random() * h);
      if (grid[gz * w + gx] !== 0) continue;
      const wx = gx * cell + cell / 2;
      const wz = gz * cell + cell / 2;
      const d = Math.hypot(wx - pcell.x, wz - pcell.z);
      if (d > 18 && d < 55) {
        z.spawnAt(wx, wz);
        return;
      }
    }
    // fallback: any floor cell
    for (let tries = 0; tries < 200; tries++) {
      const gx = Math.floor(Math.random() * w);
      const gz = Math.floor(Math.random() * h);
      if (grid[gz * w + gx] === 0) {
        z.spawnAt(gx * cell + cell / 2, gz * cell + cell / 2);
        return;
      }
    }
  }

  private endWave(): void {
    const bonus = 250 * this.wave;
    this.stats.score += bonus;
    this.ui.addFeed(`WAVE ${this.wave} CLEARED  +${bonus}`);
    if (this.wave >= this.escapeUnlockedByWave && !this.escapeOpen) {
      this.escapeOpen = true;
      this.ui.showBanner('EXIT UNSEALED', 'FIND THE GREEN DOOR — HOLD E');
      this.audio.escapeWin();
    }
    if (this.wave >= WAVES.length) {
      // final wave done — exit definitely open; player must still reach it
      this.ui.showBanner('ALL WAVES CLEARED', 'GET OUT');
      this.audio.escapeWin();
      this.escapeOpen = true;
      return;
    }
    this.waveBreak = 6;
  }

  // ---------------- per-frame ----------------

  private updatePlaying(dt: number): void {
    this.runTime += dt;
    this.stats.timeSurvived = this.runTime;

    // flow field update (throttled by cell change internally — just recompute; it's fast)
    this.level.updateFlow(this.player.pos);

    // player
    this.player.update(dt, this.input, this.level, this.input.isLocked);
    this.player.applyToCamera(this.camera, this.time);
    // recoil into camera
    this.camera.rotation.x += this.weapons.recoilPitch;
    // shoot kick: tiny random rotational shake, decays fast
    if (this.shake > 0.0001) {
      this.camera.rotation.y += (Math.random() - 0.5) * this.shake * 0.35;
      this.camera.rotation.z += (Math.random() - 0.5) * this.shake * 0.3;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.25;
      this.shake *= Math.exp(-14 * dt);
    }

    // weapons
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    if (this.input.isLocked && this.input.mouse0 && this.weapons.current.spec.auto) {
      this.weapons.tryFire(this.camera.getWorldPosition(new THREE.Vector3()), fwd, this.zombies);
    } else if (this.input.isLocked && this.input.consumeMouse0Pressed()) {
      this.weapons.tryFire(this.camera.getWorldPosition(new THREE.Vector3()), fwd, this.zombies);
    }
    if (this.input.pressed('KeyR')) this.weapons.reload();
    if (this.input.pressed('Digit1')) this.weapons.switchTo(0);
    if (this.input.pressed('Digit2')) this.weapons.switchTo(1);
    if (this.input.pressed('Digit3')) this.weapons.switchTo(2);
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.weapons.cycle(wheel);
    this.weapons.update(dt, this.player.speed, this.player.sprinting);

    // zombies
    for (const z of this.zombies.active) {
      z.update(
        dt,
        this.player.pos,
        this.level,
        (_zz, dmg) => {
          const died = this.player.damage(dmg);
          this.ui.damageFlash();
          this.audio.playerHurt();
          if (died) this.die();
        },
        (_zz, dist) => this.audio.zombieGrowl(dist),
      );
    }

    // wave logic
    if (this.waveSpawnQueue > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const alive = this.zombies.active.length;
        if (alive < 24) {
          this.spawnZombie();
          this.waveSpawnQueue--;
          this.spawnTimer = randRange(0.5, 1.4);
        } else {
          this.spawnTimer = 0.5;
        }
      }
    } else if (this.zombies.active.length === 0 && this.waveBreak <= 0 && this.state === 'playing') {
      this.endWave();
    }
    if (this.waveBreak > 0) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0 && this.wave < WAVES.length) {
        this.startWave(this.wave + 1);
      }
    }

    // dying zombies anim
    for (const z of this.zombies.items) {
      if (z.dying) z.update(dt, this.player.pos, this.level, () => {}, () => {});
    }

    // escape mechanic
    const esc = this.level.data.escapeCell;
    const escX = esc.x * CFG.world.cell + CFG.world.cell / 2;
    const escZ = esc.z * CFG.world.cell + CFG.world.cell / 2;
    const nearEscape = Math.hypot(this.player.pos.x - escX, this.player.pos.z - escZ) < 3.2;
    if (this.escapeOpen && nearEscape) {
      const holding = this.input.isLocked && this.input.down('KeyE');
      this.escapeHold = holding ? this.escapeHold + dt : Math.max(0, this.escapeHold - dt * 2);
      this.ui.setInteract(true, this.escapeHold / this.escapeHoldNeeded);
      if (this.escapeHold >= this.escapeHoldNeeded) {
        this.win();
      }
    } else {
      this.ui.setInteract(false, 0);
    }

    // fx
    this.fx.update(dt, this.camera);
    this.post.setHurt(1 - this.player.health / CFG.player.maxHealth);
    this.audio.setTension(Math.min(1, this.zombies.active.length / 20));

    // hud
    this.ui.setHealth(this.player.health, CFG.player.maxHealth);
    this.ui.setStamina(this.player.stamina);
    this.ui.setScore(this.stats.score);
    this.ui.setWave(this.wave, WAVES.length, this.zombies.active.length + this.waveSpawnQueue);
    this.ui.setRecTime(this.runTime);
    this.minimap.update(
      this.level, this.zombies,
      this.player.pos.x, this.player.pos.z,
      this.player.yaw, CFG.world.cell,
      this.level.data.w, this.level.data.h,
    );
  }

  private die(): void {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.stats.wave = this.wave;
    this.stats.accuracy = this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0;
    this.input.exitLock();
    this.ui.setHudVisible(false);
    this.ui.showEnd(false, this.stats);
    this.audio.setTension(0);
    this.opts.onEnd?.({ ...this.stats, won: false });
  }

  private win(): void {
    if (this.state !== 'playing') return;
    this.state = 'won';
    this.stats.wave = this.wave;
    this.stats.accuracy = this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0;
    this.stats.score += 1000 + Math.max(0, Math.floor((600 - this.runTime))) * 2;
    this.input.exitLock();
    this.ui.setHudVisible(false);
    this.ui.showEnd(true, this.stats);
    this.audio.escapeWin();
    this.opts.onEnd?.({ ...this.stats, won: true });
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    if (this.state === 'playing') {
      this.updatePlaying(dt);
    } else {
      // idle drift for menu backdrop
      this.player.applyToCamera(this.camera, this.time);
      this.fx.update(dt, this.camera);
    }

    if (this.fxEnabled) {
      this.post.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.input.endFrame();
  };

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    try {
      this.input.exitLock();
    } catch {
      /* no lock held */
    }
    this.input.destroy();
    this.zombies.dispose();
    this.fx.dispose();
    this.weapons.dispose();
    this.audio.dispose();
    this.ui.destroy();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
