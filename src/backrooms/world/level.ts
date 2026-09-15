import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from '../core/config';
import { RNG } from '../core/rng';
import { MUHROW33, buildTextures } from './textures';

export const SOLID = 1;
export const FLOOR = 0;

/** Grid-space BFS flow field for zombie navigation. */
export class FlowField {
  dist: Int16Array;
  w: number;
  h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.dist = new Int16Array(w * h);
  }

  /** BFS from goal cell(s). Recompute every ~0.4s or when player changes cell. */
  compute(grid: Uint8Array, gw: number, _gh: number, goalX: number, goalZ: number): void {
    this.dist.fill(-1);
    const w = gw;
    const qx = new Int32Array(w * this.h);
    const qz = new Int32Array(w * this.h);
    let head = 0;
    let tail = 0;
    const gi = goalZ * w + goalX;
    if (grid[gi] === SOLID) return;
    this.dist[gi] = 0;
    qz[tail] = goalZ;
    qx[tail] = goalX;
    tail++;

    while (head < tail) {
      const z = qz[head];
      const x = qx[head];
      head++;
      const d = this.dist[z * w + x];
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const nz = z + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
        const ni = nz * w + nx;
        if (grid[ni] === SOLID) continue;
        if (this.dist[ni] !== -1) continue;
        this.dist[ni] = d + 1;
        qz[tail] = nz;
        qx[tail] = nx;
        tail++;
      }
    }
  }

  at(x: number, z: number): number {
    return this.dist[z * this.w + x];
  }
}

export type LevelData = {
  grid: Uint8Array;
  w: number;
  h: number;
  cell: number;
  spawnCell: { x: number; z: number };
  endCell: { x: number; z: number };
  escapeCell: { x: number; z: number };
  lampPositions: THREE.Vector3[];
};

export class Level {
  data!: LevelData;
  group = new THREE.Group();
  collider!: AABBList;
  flow = new FlowField(CFG.world.mapW, CFG.world.mapH);

  private matWall!: THREE.MeshStandardMaterial;
  private matWallEnd!: THREE.MeshStandardMaterial;
  private matFloor!: THREE.MeshStandardMaterial;
  private matCeil!: THREE.MeshStandardMaterial;

  constructor(renderer: THREE.WebGLRenderer) {
    const tex = buildTextures(MUHROW33);

    // Set repeat per surface — walls tile per 4m cell, floors/ceilings too.
    const cell = CFG.world.cell;
    tex.wallpaper.repeat.set(cell / 4, cell / CFG.world.wallH / 2);
    tex.wallpaperEnd.repeat.set(cell / 4, cell / CFG.world.wallH / 2);
    tex.carpet.repeat.set(cell / 2, cell / 2);
    tex.ceiling.repeat.set(cell / 2, cell / 2);

    this.matWall = new THREE.MeshStandardMaterial({
      map: tex.wallpaper,
      roughness: 0.92,
      metalness: 0.0,
      color: 0xd8ccaa,
    });
    this.matWallEnd = new THREE.MeshStandardMaterial({
      map: tex.wallpaperEnd,
      roughness: 0.95,
      metalness: 0.0,
      color: 0xd8ccaa,
    });
    this.matFloor = new THREE.MeshStandardMaterial({
      map: tex.carpet,
      roughness: 1.0,
      metalness: 0.0,
      color: 0xcfc2a0,
    });
    this.matCeil = new THREE.MeshStandardMaterial({
      map: tex.ceiling,
      roughness: 0.88,
      metalness: 0.0,
      color: 0xd8d0b4,
    });

    void renderer;
  }

  generate(seed: number): void {
    const { mapW: W, mapH: H } = CFG.world;
    const rng = new RNG(seed);
    const grid = new Uint8Array(W * H).fill(SOLID);

    // --- Drunkard's walk carve-out (classic backrooms topology) ---
    const carvers = 3;
    const targetFloor = Math.floor(W * H * 0.42);
    let floorCount = 0;
    for (let c = 0; c < carvers; c++) {
      let x = Math.floor(W / 2) + rng.int(-6, 6);
      let z = Math.floor(H / 2) + rng.int(-6, 6);
      let dir = rng.int(0, 3);
      let steps = 0;
      while (floorCount < targetFloor && steps < 100000) {
        steps++;
        if (x > 1 && x < W - 2 && z > 1 && z < H - 2) {
          const i = z * W + x;
          if (grid[i] === SOLID) {
            grid[i] = FLOOR;
            floorCount++;
            // occasionally carve a 2-wide corridor
            if (rng.chance(0.25)) {
              const wi = z * W + Math.min(W - 2, x + 1);
              if (grid[wi] === SOLID) {
                grid[wi] = FLOOR;
                floorCount++;
              }
            }
          }
        }
        // turn sometimes
        if (rng.chance(0.28)) dir = (dir + rng.int(1, 3)) & 3;
        // bias to continue straight
        x += dir === 0 ? 1 : dir === 1 ? -1 : 0;
        z += dir === 2 ? 1 : dir === 3 ? -1 : 0;
        if (x <= 1 || x >= W - 2 || z <= 1 || z >= H - 2) {
          x = Math.max(2, Math.min(W - 3, x));
          z = Math.max(2, Math.min(H - 3, z));
          dir = rng.int(0, 3);
        }
      }
    }

    // --- Open some "rooms" — clear rectangular areas ---
    for (let r = 0; r < 5; r++) {
      const rw = rng.int(4, 8);
      const rh = rng.int(4, 8);
      const rx = rng.int(2, W - rw - 3);
      const rz = rng.int(2, H - rh - 3);
      for (let z = rz; z < rz + rh; z++) {
        for (let x = rx; x < rx + rw; x++) {
          const i = z * W + x;
          if (grid[i] === SOLID) {
            grid[i] = FLOOR;
            floorCount++;
          }
        }
      }
    }

    // Reconnect isolated floor regions with simple flood-fill relink
    const label = new Int32Array(W * H).fill(-1);
    let regions = 0;
    const regionCells: { x: number; z: number }[][] = [];
    for (let i = 0; i < W * H; i++) {
      if (grid[i] === FLOOR && label[i] === -1) {
        const cells: { x: number; z: number }[] = [];
        const stack = [i];
        label[i] = regions;
        while (stack.length) {
          const ci = stack.pop()!;
          cells.push({ x: ci % W, z: (ci / W) | 0 });
          const cx = ci % W;
          const cz = (ci / W) | 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = cx + dx;
            const nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
            const ni = nz * W + nx;
            if (grid[ni] === FLOOR && label[ni] === -1) {
              label[ni] = regions;
              stack.push(ni);
            }
          }
        }
        regionCells.push(cells);
        regions++;
      }
    }
    // Connect each region to region 0 with an L-corridor
    for (let r = 1; r < regions; r++) {
      const a = regionCells[r][0];
      const b = regionCells[0][0];
      let x = a.x;
      let z = a.z;
      while (x !== b.x) {
        x += x < b.x ? 1 : -1;
        const i = z * W + x;
        if (grid[i] === SOLID) grid[i] = FLOOR;
      }
      while (z !== b.z) {
        z += z < b.z ? 1 : -1;
        const i = z * W + x;
        if (grid[i] === SOLID) grid[i] = FLOOR;
      }
    }

    // --- Pick spawn / escape cells far apart ---
    const floors: { x: number; z: number }[] = [];
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (grid[z * W + x] === FLOOR) floors.push({ x, z });
      }
    }
    rng.shuffle(floors);
    const spawnCell = floors[0];
    let escapeCell = floors[floors.length - 1];
    // ensure escape is reasonably far
    for (const f of floors) {
      const d = Math.abs(f.x - spawnCell.x) + Math.abs(f.z - spawnCell.z);
      const de = Math.abs(escapeCell.x - spawnCell.x) + Math.abs(escapeCell.z - spawnCell.z);
      if (d > de) escapeCell = f;
    }
    // end cell = midpoint region (activate end-room wallpaper there)
    let endCell = floors[Math.floor(floors.length / 2)];
    let bestD = Infinity;
    const midX = (spawnCell.x + escapeCell.x) / 2;
    const midZ = (spawnCell.z + escapeCell.z) / 2;
    for (const f of floors) {
      const d = Math.abs(f.x - midX) + Math.abs(f.z - midZ);
      if (d < bestD) {
        bestD = d;
        endCell = f;
      }
    }

    this.data = {
      grid,
      w: W,
      h: H,
      cell: CFG.world.cell,
      spawnCell,
      endCell,
      escapeCell,
      lampPositions: [],
    };

    this.collider = buildCollision(grid, W, H, CFG.world.cell);
    this.buildMeshes(grid, W, H, escapeCell, endCell);
    this.buildLights(grid, W, H, rng, spawnCell);
  }

  /** Merge static geometry into a handful of draw calls. */
  private buildMeshes(grid: Uint8Array, W: number, H: number, escapeCell: { x: number; z: number }, endCell: { x: number; z: number }): void {
    const cell = CFG.world.cell;
    const wallH = CFG.world.wallH;

    const wallGeos: THREE.BufferGeometry[] = [];
    const wallEndGeos: THREE.BufferGeometry[] = [];
    const floorGeos: THREE.BufferGeometry[] = [];
    const ceilGeos: THREE.BufferGeometry[] = [];

    const inRange = (cx: number, cz: number, target: { x: number; z: number }, r: number) =>
      Math.abs(cx - target.x) <= r && Math.abs(cz - target.z) <= r;

    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        const wx = x * cell;
        const wz = z * cell;

        if (grid[i] === FLOOR) {
          const fg = new THREE.PlaneGeometry(cell, cell);
          fg.rotateX(-Math.PI / 2);
          fg.translate(wx + cell / 2, 0, wz + cell / 2);
          floorGeos.push(fg);

          const cg = new THREE.PlaneGeometry(cell, cell);
          cg.rotateX(Math.PI / 2);
          cg.translate(wx + cell / 2, CFG.world.ceilH, wz + cell / 2);
          ceilGeos.push(cg);
        } else {
          // Wall block — only add faces adjacent to floor (face culling)
          const isEnd = inRange(x, z, endCell, 2);
          const g = new THREE.BoxGeometry(cell, wallH, cell);
          g.translate(wx + cell / 2, wallH / 2, wz + cell / 2);
          if (isEnd) wallEndGeos.push(g);
          else wallGeos.push(g);
          void isEnd;
        }
      }
    }

    const merge = (geos: THREE.BufferGeometry[]) => {
      if (!geos.length) return null;
      const m = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      return m;
    };

    const wallMesh = merge(wallGeos);
    if (wallMesh) this.group.add(new THREE.Mesh(wallMesh, this.matWall));
    const wallEndMesh = merge(wallEndGeos);
    if (wallEndMesh) this.group.add(new THREE.Mesh(wallEndMesh, this.matWallEnd));
    const floorMesh = merge(floorGeos);
    if (floorMesh) this.group.add(new THREE.Mesh(floorMesh, this.matFloor));
    const ceilMesh = merge(ceilGeos);
    if (ceilMesh) this.group.add(new THREE.Mesh(ceilMesh, this.matCeil));

    // Escape hatch marker — a dark doorway frame on the escape cell
    const ex = escapeCell.x * cell + cell / 2;
    const ez = escapeCell.z * cell + cell / 2;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(cell * 0.7, wallH * 0.82, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x0a0906, roughness: 0.6, metalness: 0.3, emissive: 0x050403 }),
    );
    frame.position.set(ex, wallH * 0.41, ez);
    frame.name = 'escapeFrame';
    this.group.add(frame);

    // subtle green glow so players can find it
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(cell * 0.6, wallH * 0.7),
      new THREE.MeshBasicMaterial({ color: 0x1b3a1b, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    glow.position.set(ex, wallH * 0.45, ez);
    glow.name = 'escapeGlow';
    this.group.add(glow);
  }

  /** Fluorescent lamp fixtures: instanced panels + a few real PointLights near spawn/escape. */
  private buildLights(grid: Uint8Array, W: number, H: number, rng: RNG, spawnCell: { x: number; z: number }): void {
    const cell = CFG.world.cell;
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
    const lampFrameMat = new THREE.MeshStandardMaterial({ color: 0x8a8468, roughness: 0.5, metalness: 0.4 });

    const positions: { x: number; z: number }[] = [];
    for (let z = 1; z < H - 1; z++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[z * W + x] !== FLOOR) continue;
        // lamps on a loose grid, some missing (dark zones!)
        if (x % 3 === 0 && z % 3 === 0 && rng.chance(0.82)) {
          positions.push({ x, z });
        }
      }
    }

    const panelGeo = new THREE.BoxGeometry(cell * 0.5, 0.06, cell * 0.16);
    const panels = new THREE.InstancedMesh(panelGeo, lampMat, positions.length);
    const frameGeo = new THREE.BoxGeometry(cell * 0.56, 0.09, cell * 0.22);
    const frames = new THREE.InstancedMesh(frameGeo, lampFrameMat, positions.length);
    const m = new THREE.Matrix4();

    positions.forEach((p, idx) => {
      const wx = p.x * cell + cell / 2;
      const wz = p.z * cell + cell / 2;
      m.makeTranslation(wx, CFG.world.ceilH - 0.05, wz);
      panels.setMatrixAt(idx, m);
      m.makeTranslation(wx, CFG.world.ceilH - 0.055, wz);
      frames.setMatrixAt(idx, m);
      this.data.lampPositions.push(new THREE.Vector3(wx, CFG.world.ceilH - 0.1, wz));
    });
    panels.instanceMatrix.needsUpdate = true;
    frames.instanceMatrix.needsUpdate = true;
    this.group.add(panels, frames);

    // A handful of REAL point lights near spawn for depth; the rest is ambient fake.
    const near = this.data.lampPositions
      .filter((p) => Math.hypot(p.x - (spawnCell.x * cell + cell / 2), p.z - (spawnCell.z * cell + cell / 2)) < 30)
      .sort(() => rng.next())
      .slice(0, 10);
    for (const p of near) {
      const light = new THREE.PointLight(0xffe9a8, 30, 20, 1.7);
      light.position.set(p.x, CFG.world.ceilH - 0.35, p.z);
      light.name = 'lampLight';
      this.group.add(light);
    }
  }

  /** Refresh the zombie flow field toward the player's cell. */
  updateFlow(playerPos: THREE.Vector3): void {
    const cell = this.data.cell;
    const cx = Math.floor(playerPos.x / cell);
    const cz = Math.floor(playerPos.z / cell);
    if (cx >= 0 && cz >= 0 && cx < this.data.w && cz < this.data.h) {
      this.flow.compute(this.data.grid, this.data.w, this.data.h, cx, cz);
    }
  }

  isSolidAt(x: number, z: number): boolean {
    const { grid, w, h, cell } = this.data;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    if (cx < 0 || cz < 0 || cx >= w || cz >= h) return true;
    return grid[cz * w + cx] === SOLID;
  }
}

export type AABB = { minX: number; minZ: number; maxX: number; maxZ: number };
export type AABBList = AABB[];

/** Merge solid cells into row-run AABBs for fast, simple collision. */
export function buildCollision(grid: Uint8Array, W: number, H: number, cell: number): AABBList {
  const boxes: AABBList = [];
  const used = new Uint8Array(W * H);
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (grid[i] !== SOLID || used[i]) continue;
      // extend run in +x
      let x2 = x;
      while (x2 + 1 < W && grid[z * W + (x2 + 1)] === SOLID && !used[z * W + (x2 + 1)]) x2++;
      // extend run in +z (rectangle)
      let z2 = z;
      outer: while (z2 + 1 < H) {
        for (let xx = x; xx <= x2; xx++) {
          if (grid[(z2 + 1) * W + xx] !== SOLID || used[(z2 + 1) * W + xx]) break outer;
        }
        z2++;
      }
      for (let zz = z; zz <= z2; zz++) {
        for (let xx = x; xx <= x2; xx++) used[zz * W + xx] = 1;
      }
      boxes.push({
        minX: x * cell,
        minZ: z * cell,
        maxX: (x2 + 1) * cell,
        maxZ: (z2 + 1) * cell,
      });
    }
  }
  return boxes;
}

/** Circle-vs-AABBList sliding resolution on XZ plane. Mutates pos. */
export function resolveCollision(
  pos: THREE.Vector3,
  radius: number,
  boxes: AABBList,
): void {
  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // center inside box — push out along smallest axis
        const left = pos.x - b.minX;
        const right = b.maxX - pos.x;
        const top = pos.z - b.minZ;
        const bot = b.maxZ - pos.z;
        const m = Math.min(left, right, top, bot);
        if (m === left) pos.x = b.minX - radius;
        else if (m === right) pos.x = b.maxX + radius;
        else if (m === top) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
  }
}
