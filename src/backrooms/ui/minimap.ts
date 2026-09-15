import type { Level } from '../world/level';
import type { ZombiePool } from '../entities/zombie';

/** Radar-style minimap: explores fog-of-war around the player each frame. */
export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private seen: Uint8Array;
  private size = 150;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.seen = new Uint8Array(0);
  }

  reset(w: number, h: number): void {
    this.seen = new Uint8Array(w * h);
  }

  update(level: Level, pool: ZombiePool, px: number, pz: number, yaw: number, cell: number, mapW: number, mapH: number): void {
    const ctx = this.ctx;
    const S = this.size;
    const view = 15; // cells visible radius
    const scale = S / (view * 2);

    // reveal cells near player
    const pcx = Math.floor(px / cell);
    const pcz = Math.floor(pz / cell);
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = pcx + dx;
        const z = pcz + dz;
        if (x < 0 || z < 0 || x >= mapW || z >= mapH) continue;
        this.seen[z * mapW + x] = 1;
      }
    }

    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(5,4,3,0.0)';
    ctx.fillRect(0, 0, S, S);

    const toScreen = (wx: number, wz: number): [number, number] => [
      (wx / cell - px / cell) * scale + S / 2,
      (wz / cell - pz / cell) * scale + S / 2,
    ];

    // walls & floor
    for (let z = pcz - view; z <= pcz + view; z++) {
      for (let x = pcx - view; x <= pcx + view; x++) {
        if (x < 0 || z < 0 || x >= mapW || z >= mapH) continue;
        if (!this.seen[z * mapW + x]) continue;
        const [sx, sz] = toScreen(x * cell, z * cell);
        if (level.data.grid[z * mapW + x] === 1) {
          ctx.fillStyle = 'rgba(122,106,53,0.55)';
          ctx.fillRect(sx, sz, scale + 0.5, scale + 0.5);
        } else {
          ctx.fillStyle = 'rgba(232,220,178,0.08)';
          ctx.fillRect(sx, sz, scale + 0.5, scale + 0.5);
        }
      }
    }

    // exit marker (always visible once seen — or blinking always to guide)
    const [ex, ez] = toScreen(level.data.escapeCell.x * cell + cell / 2, level.data.escapeCell.z * cell + cell / 2);
    ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#9cc46a' : '#5c854a';
    ctx.fillRect(ex - 3, ez - 3, 6, 6);

    // zombies
    ctx.fillStyle = '#ff5a3c';
    for (const z of pool.active) {
      const [sx, sz] = toScreen(z.pos.x, z.pos.z);
      if (sx < 0 || sz < 0 || sx > S || sz > S) continue;
      ctx.beginPath();
      ctx.arc(sx, sz, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // player arrow
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.5, 4);
    ctx.lineTo(-3.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // frame vignette
    ctx.strokeStyle = 'rgba(232,220,178,0.15)';
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
}
