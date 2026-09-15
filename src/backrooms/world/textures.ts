import * as THREE from 'three';

/** Muhrow33 — unique seed namespace for BACKROOMS: NO-CLIP procedural textures. */
export const MUHROW33 = 'MUHROW33';

export type TexSet = {
  wallpaper: THREE.Texture;
  wallpaperEnd: THREE.Texture;
  carpet: THREE.Texture;
  ceiling: THREE.Texture;
};

/** Tiny seeded value-noise implementation (texture-space, no deps). */
function makeValueNoise(seed: number) {
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  let s = seed >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];

  const grid = new Float32Array(256 * 256);
  for (let i = 0; i < grid.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    grid[i] = s / 4294967296;
  }

  const fade = (t: number) => t * t * (3 - 2 * t);
  const g = (x: number, y: number) => grid[((y & 255) << 8) | (x & 255)];

  return function noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);
    const a = g(xi, yi);
    const b = g(xi + 1, yi);
    const c = g(xi, yi + 1);
    const d = g(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** fbm helper */
function fbm(n: (x: number, y: number) => number, x: number, y: number, oct: number): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * n(x * f, y * f);
    amp *= 0.5;
    f *= 2;
  }
  return v;
}

function makeCanvas(w: number, h: number): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, ctx: cv.getContext('2d')! };
}

function toTexture(cv: HTMLCanvasElement, repeat: number): THREE.Texture {
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The iconic two-tone yellow wallpaper with vertical stripe pattern,
 * damp stains, and scuffs. 512x512, seamless via mirrored edges.
 */
function buildWallpaper(seed: number): HTMLCanvasElement {
  const S = 512;
  const { cv, ctx } = makeCanvas(S, S);
  const noise = makeValueNoise(seed);
  const noise2 = makeValueNoise(seed ^ 0x9e3779b9);

  // Base gradient of the mono-yellow
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#c8b46a');
  grad.addColorStop(0.5, '#bfa759');
  grad.addColorStop(1, '#b39c52');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  // Fine paper grain
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const x = (i >> 2) % S;
    const y = (i >> 2) / S | 0;
    const n = fbm(noise, x * 0.08, y * 0.08, 4);
    const grain = (n - 0.5) * 26;
    d[i] = Math.max(0, Math.min(255, d[i] + grain));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + grain));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + grain * 0.85));
  }
  ctx.putImageData(img, 0, 0);

  // Vertical stripe pattern (the classic look) — darker bands ~64px
  ctx.globalAlpha = 0.14;
  for (let x = 0; x < S; x += 64) {
    ctx.fillStyle = '#7a6a35';
    ctx.fillRect(x, 0, 30, S);
    ctx.fillStyle = '#e2d08a';
    ctx.fillRect(x + 30, 0, 8, S);
  }
  ctx.globalAlpha = 1;

  // Damp stains (big soft blotches, darker)
  for (let i = 0; i < 7; i++) {
    const x = noise2(i * 12.7, 3.1) * S;
    const y = noise2(i * 4.3, 9.7) * S;
    const r = 30 + noise2(i * 7.7, 1.3) * 90;
    const g2 = ctx.createRadialGradient(x, y, 2, x, y, r);
    g2.addColorStop(0, 'rgba(92,74,32,0.22)');
    g2.addColorStop(0.7, 'rgba(80,64,28,0.10)');
    g2.addColorStop(1, 'rgba(80,64,28,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Scuffs / scratches
  ctx.strokeStyle = 'rgba(60,48,20,0.16)';
  for (let i = 0; i < 26; i++) {
    ctx.lineWidth = 0.5 + noise2(i, 2) * 1.4;
    ctx.beginPath();
    const x = noise2(i * 3.3, 5.5) * S;
    const y = noise2(i * 1.9, 8.8) * S;
    const len = 10 + noise2(i, 4) * 46;
    const a = noise2(i, 6) * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  // Dark baseboard-ish grime at the bottom edge (helps the wall meet floor)
  const grime = ctx.createLinearGradient(0, S - 60, 0, S);
  grime.addColorStop(0, 'rgba(40,32,14,0)');
  grime.addColorStop(1, 'rgba(40,32,14,0.35)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, S - 60, S, 60);

  return cv;
}

/**
 * Variant wallpaper for special "end rooms" — grayer, sicker tint.
 */
function buildWallpaperEnd(seed: number): HTMLCanvasElement {
  const cv = buildWallpaper(seed ^ 0x51ab);
  const ctx = cv.getContext('2d')!;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(150,160,140,0.55)';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = 'source-over';
  return cv;
}

/**
 * Damp mono-yellow office carpet — dense noise blotches, stains, seam lines.
 */
function buildCarpet(seed: number): HTMLCanvasElement {
  const S = 512;
  const { cv, ctx } = makeCanvas(S, S);
  const noise = makeValueNoise(seed ^ 0xc0ffee);
  const noise2 = makeValueNoise(seed ^ 0x77aa);

  ctx.fillStyle = '#9a8a48';
  ctx.fillRect(0, 0, S, S);

  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const x = (i >> 2) % S;
    const y = (i >> 2) / S | 0;
    const n = fbm(noise, x * 0.22, y * 0.22, 4);
    const n2 = fbm(noise2, x * 0.045, y * 0.045, 3);
    const v = (n - 0.5) * 60 + (n2 - 0.5) * 34;
    d[i] = Math.max(0, Math.min(255, d[i] + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v * 0.96));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 0.72));
  }
  ctx.putImageData(img, 0, 0);

  // Dark damp patches
  for (let i = 0; i < 9; i++) {
    const x = noise2(i * 5.1, 2.2) * S;
    const y = noise2(i * 9.3, 7.7) * S;
    const r = 26 + noise2(i * 3.7, 4.1) * 70;
    const g2 = ctx.createRadialGradient(x, y, 1, x, y, r);
    g2.addColorStop(0, 'rgba(52,44,18,0.30)');
    g2.addColorStop(1, 'rgba(52,44,18,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Carpet tile seams every 128px
  ctx.strokeStyle = 'rgba(48,40,16,0.25)';
  ctx.lineWidth = 2;
  for (let p = 0; p <= S; p += 128) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.stroke();
  }

  return cv;
}

/**
 * Acoustic drop-ceiling tiles with recessed grid and grime.
 */
function buildCeiling(seed: number): HTMLCanvasElement {
  const S = 512;
  const { cv, ctx } = makeCanvas(S, S);
  const noise = makeValueNoise(seed ^ 0xbeef01);

  ctx.fillStyle = '#cfc7a6';
  ctx.fillRect(0, 0, S, S);

  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const x = (i >> 2) % S;
    const y = (i >> 2) / S | 0;
    const n = fbm(noise, x * 0.10, y * 0.10, 3);
    const v = (n - 0.5) * 22;
    d[i] = Math.max(0, Math.min(255, d[i] + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 0.9));
  }
  ctx.putImageData(img, 0, 0);

  // Fissured-tile speckles
  for (let i = 0; i < 900; i++) {
    const x = noise(i * 1.7, i * 2.3) * S;
    const y = noise(i * 3.1, i * 1.1) * S;
    ctx.fillStyle = `rgba(96,88,64,${0.05 + noise(i, 9) * 0.10})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Grid lines — 2 tiles per texture (each tile 256px)
  ctx.strokeStyle = 'rgba(70,62,40,0.85)';
  ctx.lineWidth = 5;
  for (let p = 0; p <= S; p += 256) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.stroke();
  }
  // Soft shadow near the grid
  ctx.strokeStyle = 'rgba(70,62,40,0.18)';
  ctx.lineWidth = 14;
  for (let p = 0; p <= S; p += 256) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.stroke();
  }

  return cv;
}

/**
 * Zombie face texture for billboards — pale sickly head, dark eye sockets,
 * gaping mouth. Drawn front-facing, centered in the upper half of the canvas.
 */
export function buildZombieFaceCanvas(seed: number, kindColor: string): HTMLCanvasElement {
  const S = 128;
  const { cv, ctx } = makeCanvas(S, S);
  const noise = makeValueNoise(seed);

  // Head — pale sickly ellipse
  const cx = S / 2;
  const cy = S * 0.42;
  const rx = S * 0.30;
  const ry = S * 0.36;
  const hg = ctx.createRadialGradient(cx - 6, cy - 8, 4, cx, cy, rx * 1.4);
  hg.addColorStop(0, '#cfc3a2');
  hg.addColorStop(0.7, kindColor);
  hg.addColorStop(1, 'rgba(30,26,14,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Skin mottling
  for (let i = 0; i < 26; i++) {
    const x = cx + (noise(i * 3.7, 1) - 0.5) * rx * 1.7;
    const y = cy + (noise(i * 1.9, 7) - 0.5) * ry * 1.6;
    const r = 2 + noise(i, 3) * 7;
    ctx.fillStyle = `rgba(60,48,22,${0.08 + noise(i, 5) * 0.14})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eye sockets — dark hollows
  for (const ex of [-1, 1]) {
    const x = cx + ex * rx * 0.42;
    const y = cy - ry * 0.22;
    const g2 = ctx.createRadialGradient(x, y, 1, x, y, rx * 0.34);
    g2.addColorStop(0, 'rgba(5,4,2,0.95)');
    g2.addColorStop(0.6, 'rgba(20,16,8,0.75)');
    g2.addColorStop(1, 'rgba(20,16,8,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.26, rx * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();

    // tiny pale iris glint
    ctx.fillStyle = 'rgba(214,200,150,0.85)';
    ctx.beginPath();
    ctx.arc(x + ex * 1.5, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose shadow
  ctx.fillStyle = 'rgba(40,32,14,0.30)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.12, rx * 0.10, ry * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth — dark gaping maw with teeth hints
  const my = cy + ry * 0.48;
  const mg = ctx.createRadialGradient(cx, my, 1, cx, my, rx * 0.42);
  mg.addColorStop(0, 'rgba(8,5,2,0.98)');
  mg.addColorStop(1, 'rgba(8,5,2,0)');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.ellipse(cx, my, rx * 0.34, ry * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // crooked teeth
  ctx.fillStyle = 'rgba(196,184,142,0.85)';
  for (let i = 0; i < 5; i++) {
    const tx = cx - rx * 0.22 + i * rx * 0.11;
    const th = 3 + noise(i, 11) * 4;
    ctx.fillRect(tx, my - ry * 0.18, 2.4, th);
  }

  return cv;
}

/**
 * Zombie body texture — ragged torso blob, used as the billboard base.
 */
export function buildZombieBodyCanvas(seed: number, kindColor: string): HTMLCanvasElement {
  const S = 128;
  const { cv, ctx } = makeCanvas(S, S);
  const noise = makeValueNoise(seed ^ 0x1234);

  // torso — ragged vertical blob
  const cx = S / 2;
  const g2 = ctx.createRadialGradient(cx, S * 0.52, 6, cx, S * 0.55, S * 0.46);
  g2.addColorStop(0, kindColor);
  g2.addColorStop(0.75, 'rgba(58,48,26,0.85)');
  g2.addColorStop(1, 'rgba(58,48,26,0)');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.ellipse(cx, S * 0.55, S * 0.34, S * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();

  // ragged streaks (clothing rot)
  ctx.strokeStyle = 'rgba(24,20,10,0.5)';
  for (let i = 0; i < 14; i++) {
    ctx.lineWidth = 1 + noise(i, 2) * 2.5;
    const x = cx + (noise(i, 5) - 0.5) * S * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, S * 0.3 + noise(i, 3) * 10);
    ctx.lineTo(x + (noise(i, 7) - 0.5) * 14, S * (0.75 + noise(i, 9) * 0.2));
    ctx.stroke();
  }

  // dark stains
  for (let i = 0; i < 10; i++) {
    const x = cx + (noise(i * 2.3, 4) - 0.5) * S * 0.6;
    const y = S * (0.4 + noise(i * 1.7, 6) * 0.4);
    const r = 3 + noise(i, 8) * 9;
    ctx.fillStyle = `rgba(28,22,10,${0.15 + noise(i, 2) * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return cv;
}

/**
 * Zombie work-clothes canvas — solid stained cloth for low-poly bodies
 * (Quaternius-style flat shaded look). Tileable-ish, 128px.
 */
export function buildZombieClothCanvas(seed: number, baseColor: string): HTMLCanvasElement {
  const S = 128;
  const { cv, ctx } = makeCanvas(S, S);
  const noise = makeValueNoise(seed ^ 0xc107);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);
  // weave
  for (let y = 0; y < S; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + noise(y, 1) * 0.04})`;
    ctx.fillRect(0, y, S, 1);
  }
  // rot stains + tears
  for (let i = 0; i < 12; i++) {
    const x = noise(i * 3.1, 7) * S;
    const y = noise(i * 1.3, 3) * S;
    const r = 3 + noise(i, 9) * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(20,14,6,${0.25 + noise(i, 4) * 0.3})`);
    g.addColorStop(1, 'rgba(20,14,6,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // seam stitching
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(4, 4, S - 8, S - 8);
  ctx.setLineDash([]);
  return cv;
}

/**
 * Zombie skin canvas — sickly flesh with veins + wounds for heads/limbs.
 */
export function buildZombieSkinCanvas(seed: number, tint: string): HTMLCanvasElement {
  const S = 128;
  const { cv, ctx } = makeCanvas(S, S);
  const noise = makeValueNoise(seed ^ 0x5e1);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 30; i++) {
    const x = noise(i * 2.7, 1) * S;
    const y = noise(i * 1.1, 5) * S;
    const r = 2 + noise(i, 8) * 8;
    ctx.fillStyle = `rgba(70,50,25,${0.08 + noise(i, 2) * 0.16})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // veins
  ctx.strokeStyle = 'rgba(90,30,25,0.4)';
  for (let i = 0; i < 8; i++) {
    ctx.lineWidth = 1 + noise(i, 6) * 1.5;
    ctx.beginPath();
    let x = noise(i, 11) * S;
    let y = noise(i, 12) * S;
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (noise(i * 9 + k, 1) - 0.5) * 30;
      y += (noise(i * 7 + k, 2) - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return cv;
}

let cached: TexSet | null = null;

/** Build the full world texture set (cached). */
export function buildTextures(seedStr: string): TexSet {
  if (cached) return cached;
  // Derive numeric seed from the namespace string
  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    seed ^= seedStr.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  seed = seed >>> 0;

  cached = {
    wallpaper: toTexture(buildWallpaper(seed), 1),
    wallpaperEnd: toTexture(buildWallpaperEnd(seed), 1),
    carpet: toTexture(buildCarpet(seed), 1),
    ceiling: toTexture(buildCeiling(seed), 1),
  };
  return cached;
}
