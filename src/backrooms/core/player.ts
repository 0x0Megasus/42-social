import * as THREE from 'three';
import { CFG } from './config';
import { clamp, damp, randRange } from './math';
import type { Input } from './input';
import type { Level } from '../world/level';
import { resolveCollision } from '../world/level';

/** First-person player: WASD, sprint, stamina, health, head bob, footsteps. */
export class Player {
  pos = new THREE.Vector3(0, CFG.player.height, 0);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  health: number = CFG.player.maxHealth;
  stamina: number = 100;
  sprinting = false;
  dead = false;

  // look sensitivity multiplier (from settings)
  sens = 1.0;

  // view feel
  bobPhase = 0;
  bobAmt = 0;
  private stepDist = 0;
  private lastFootPos = new THREE.Vector3();
  hurtCooldown = 0;

  onFootstep: ((sprinting: boolean) => void) | null = null;
  onHurt: (() => void) | null = null;

  spawnAt(x: number, z: number): void {
    this.pos.set(x, CFG.player.height, z);
    this.vel.set(0, 0, 0);
    this.lastFootPos.copy(this.pos);
    this.health = CFG.player.maxHealth;
    this.stamina = 100;
    this.dead = false;
  }

  update(dt: number, input: Input, level: Level, locked: boolean): void {
    // ---- Look ----
    if (locked) {
      const { dx, dy } = input.consumeMouse();
      this.yaw -= dx * CFG.mouse.sensX * this.sens;
      this.pitch -= dy * CFG.mouse.sensY * this.sens;
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    }

    // ---- Move ----
    let mx = 0;
    let mz = 0;
    if (locked) {
      if (input.down('KeyW') || input.down('ArrowUp')) mz -= 1;
      if (input.down('KeyS') || input.down('ArrowDown')) mz += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    }
    const wish = new THREE.Vector3(mx, 0, mz);
    if (wish.lengthSq() > 0) wish.normalize();

    // sprint (stamina gated)
    const wantSprint = locked && (input.down('ShiftLeft') || input.down('ShiftRight')) && mz < 0 && this.stamina > CFG.player.staminaMinToSprint;
    this.sprinting = wantSprint && wish.lengthSq() > 0;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - CFG.player.staminaDrain * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + CFG.player.staminaRegen * dt);
    }

    const speed = this.sprinting ? CFG.player.speedSprint : CFG.player.speedWalk;
    const worldWish = new THREE.Vector3(wish.x, 0, wish.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const target = worldWish.multiplyScalar(speed);
    this.vel.x = damp(this.vel.x, target.x, CFG.player.accel, dt);
    this.vel.z = damp(this.vel.z, target.z, CFG.player.accel, dt);

    // friction when no input
    if (wish.lengthSq() === 0) {
      const f = Math.exp(-CFG.player.friction * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // ---- Collide (slide) ----
    resolveCollision(this.pos, CFG.player.radius, level.collider);

    // keep inside map bounds
    const bound = level.data.w * level.data.cell - CFG.player.radius - 0.1;
    this.pos.x = clamp(this.pos.x, CFG.player.radius + 0.1, bound);
    this.pos.z = clamp(this.pos.z, CFG.player.radius + 0.1, bound);

    // ---- Head bob + footsteps ----
    const planar = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmt = damp(this.bobAmt, planar > 0.5 ? Math.min(1, planar / CFG.player.speedSprint) : 0, 8, dt);
    this.bobPhase += planar * dt * (this.sprinting ? 2.6 : 2.0);

    this.stepDist += this.lastFootPos.distanceTo(this.pos);
    this.lastFootPos.copy(this.pos);
    const stepLen = this.sprinting ? 2.6 : 2.0;
    if (this.stepDist > stepLen && planar > 0.8) {
      this.stepDist = 0;
      this.onFootstep?.(this.sprinting);
    }

    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;
  }

  damage(amount: number): boolean {
    if (this.dead || this.hurtCooldown > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.hurtCooldown = 0.45;
    this.onHurt?.();
    if (this.health <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  /** Camera transform incl. bob + subtle sway. */
  applyToCamera(camera: THREE.PerspectiveCamera, time: number): void {
    const bobY = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.05 * this.bobAmt;
    camera.position.set(
      this.pos.x + bobX * 0.6,
      this.pos.y + bobY,
      this.pos.z,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.set(
      this.pitch + Math.sin(time * 1.7) * 0.002 * this.bobAmt,
      this.yaw,
      bobX * 0.18 + Math.sin(time * 0.9) * 0.004,
    );
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Randomized respawn nudge used on level restart. */
  static randomOffset(r = 1.5): THREE.Vector3 {
    return new THREE.Vector3(randRange(-r, r), 0, randRange(-r, r));
  }
}
