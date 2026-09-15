import * as THREE from 'three';
import { randRange } from '../core/math';

type Particle = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  gravity: number;
  drag: number;
};

export type ImpactKind = 'wall' | 'flesh';
export type WeaponKind = 'pistol' | 'smg' | 'shotgun';

const MAX_PARTICLES = 1600;

// Kenney CC0 "Particle Pack" style: soft radial sprite generated at runtime
// (no binary download needed). Used as the Points map for round glow puffs.
function makeSoftSprite(size = 64): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Star-shaped muzzle spike (Kenney "flash" style) for impact quads.
function makeFlashSprite(size = 128): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const c = size / 2;
  ctx.translate(c, c);
  // core glow
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c);
  g.addColorStop(0, 'rgba(255,246,220,1)');
  g.addColorStop(0.25, 'rgba(255,210,130,0.9)');
  g.addColorStop(0.6, 'rgba(255,150,60,0.25)');
  g.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-c, -c, size, size);
  // spikes
  ctx.fillStyle = 'rgba(255,236,190,0.95)';
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 4);
    const w = size * (i % 2 === 0 ? 0.09 : 0.05);
    const len = size * (i % 2 === 0 ? 0.5 : 0.34);
    ctx.fillRect(-w / 2, -len, w, len * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** CPU particle system rendered as THREE.Points with vertex colors + soft sprites. */
export class FXSystem {
  private scene: THREE.Scene;
  private points: THREE.Points;
  private geom: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private particles: Particle[] = [];

  // tracers
  private tracers: { mesh: THREE.Mesh; life: number; maxLife: number }[] = [];
  private tracerPool: THREE.Mesh[] = [];

  // impact flash quads (billboarded star sprites, Kenney-flash style)
  private flashes: { mesh: THREE.Mesh; life: number; maxLife: number }[] = [];
  private flashPool: THREE.Mesh[] = [];
  private flashTex: THREE.Texture;

  // pooled dynamic light for muzzle + impacts (single light, cheap)
  private boomLight: THREE.PointLight;
  private boomT = 0;
  private boomMax = 1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const sprite = makeSoftSprite();
    this.flashTex = makeFlashSprite();

    this.geom = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.geom.setAttribute('position', this.posAttr);
    this.geom.setAttribute('color', this.colAttr);
    this.geom.setAttribute('psize', this.sizeAttr);
    this.geom.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { map: { value: sprite } },
      vertexShader: /* glsl */ `
        attribute float psize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (160.0 / max(0.1, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor * tex.a, tex.a);
          if (gl_FragColor.a < 0.01) discard;
        }
      `,
      vertexColors: true,
    });
    this.points = new THREE.Points(this.geom, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);

    // tracer pool — thin stretched boxes with additive material
    const tracerGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
    tracerGeo.translate(0, 0, -0.5); // origin at muzzle end
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffe2a8,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      );
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      this.tracerPool.push(m);
    }

    // impact flash pool — camera-facing star sprites
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.5),
        new THREE.MeshBasicMaterial({
          map: this.flashTex,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      );
      m.visible = false;
      this.scene.add(m);
      this.flashPool.push(m);
    }

    this.boomLight = new THREE.PointLight(0xffc973, 0, 12, 2);
    this.scene.add(this.boomLight);

    void sprite;
  }

  private emit(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  /** World-space muzzle blast: fire cone + smoke + sparks. Call on every shot. */
  muzzle(origin: THREE.Vector3, dir: THREE.Vector3, kind: WeaponKind): void {
    const power = kind === 'shotgun' ? 1.8 : kind === 'smg' ? 0.8 : 1.0;
    // hot core
    const n = kind === 'shotgun' ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(randRange(3, 7) * power);
      v.x += randRange(-1.4, 1.4);
      v.y += randRange(-1.2, 1.4);
      v.z += randRange(-1.4, 1.4);
      this.emit({
        pos: origin.clone().addScaledVector(dir, randRange(0.05, 0.3)),
        vel: v,
        life: randRange(0.06, 0.16),
        maxLife: 0.16,
        size: randRange(3.5, 6.5) * power,
        color: new THREE.Color().setHSL(randRange(0.07, 0.12), 1, randRange(0.55, 0.72)),
        gravity: -1,
        drag: 6,
      });
    }
    // smoke puff drifting up
    const smokeN = kind === 'shotgun' ? 5 : 2;
    for (let i = 0; i < smokeN; i++) {
      this.emit({
        pos: origin.clone().addScaledVector(dir, randRange(0.3, 0.6)),
        vel: new THREE.Vector3(randRange(-0.3, 0.3), randRange(0.4, 1.0), randRange(-0.3, 0.3)),
        life: randRange(0.5, 1.1),
        maxLife: 1.1,
        size: randRange(4, 8),
        color: new THREE.Color(0.32, 0.3, 0.27),
        gravity: -0.6,
        drag: 2.2,
      });
    }
    this.punchLight(origin, kind === 'shotgun' ? 30 : 16);
  }

  /** Ejected brass shell. right = camera right in world space. */
  shell(pos: THREE.Vector3, right: THREE.Vector3): void {
    this.emit({
      pos: pos.clone(),
      vel: new THREE.Vector3(
        right.x * randRange(1.5, 2.5) + randRange(-0.4, 0.4),
        randRange(1.2, 2.0),
        right.z * randRange(1.5, 2.5) + randRange(-0.4, 0.4),
      ),
      life: randRange(0.5, 0.8),
      maxLife: 0.8,
      size: randRange(1.0, 1.6),
      color: new THREE.Color(1.0, 0.72, 0.25),
      gravity: 9.8,
      drag: 0.4,
    });
  }

  /** Unified impact: flash quad + sparks + smoke + dust. */
  impact(pos: THREE.Vector3, kind: ImpactKind, headshot = false): void {
    this.flashQuad(pos, kind === 'flesh' ? 0.55 : 0.4, kind === 'flesh' ? 0xff4a3c : 0xffd9a0);
    if (kind === 'flesh') {
      this.blood(pos, new THREE.Vector3(randRange(-0.4, 0.4), 0.5, randRange(-0.4, 0.4)), headshot ? 22 : 12);
      this.mist(pos);
    } else {
      this.sparks(pos, new THREE.Vector3(0, 0.6, 0), 10);
      this.dust(pos, 5);
      this.smoke(pos, 2);
    }
    this.punchLight(pos, kind === 'flesh' ? 6 : 8);
  }

  private flashQuad(pos: THREE.Vector3, size: number, color: number): void {
    const m = this.flashPool.find((x) => !x.visible);
    if (!m) return;
    m.position.copy(pos);
    m.scale.setScalar(size * randRange(0.85, 1.2));
    (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.95;
    m.rotation.z = Math.random() * Math.PI;
    m.visible = true;
    this.flashes.push({ mesh: m, life: 0.09, maxLife: 0.09 });
  }

  private smoke(pos: THREE.Vector3, amount = 3): void {
    for (let i = 0; i < amount; i++) {
      this.emit({
        pos: pos.clone().add(new THREE.Vector3(randRange(-0.15, 0.15), randRange(0, 0.2), randRange(-0.15, 0.15))),
        vel: new THREE.Vector3(randRange(-0.3, 0.3), randRange(0.5, 1.1), randRange(-0.3, 0.3)),
        life: randRange(0.6, 1.3),
        maxLife: 1.3,
        size: randRange(4, 7),
        color: new THREE.Color(0.3, 0.28, 0.25),
        gravity: -0.5,
        drag: 2.4,
      });
    }
  }

  private mist(pos: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      this.emit({
        pos: pos.clone(),
        vel: new THREE.Vector3(randRange(-1, 1), randRange(0.2, 1), randRange(-1, 1)),
        life: randRange(0.25, 0.5),
        maxLife: 0.5,
        size: randRange(3, 5.5),
        color: new THREE.Color().setHSL(0.0, 0.85, randRange(0.3, 0.42)),
        gravity: 1.5,
        drag: 3,
      });
    }
  }

  private punchLight(pos: THREE.Vector3, intensity: number): void {
    this.boomLight.position.copy(pos);
    this.boomLight.intensity = Math.max(this.boomLight.intensity, intensity);
    this.boomT = 0.09;
    this.boomMax = intensity;
  }

  blood(pos: THREE.Vector3, dir: THREE.Vector3, amount = 14): void {
    for (let i = 0; i < amount; i++) {
      const v = dir.clone().multiplyScalar(randRange(1.5, 4.5));
      v.x += randRange(-1.6, 1.6);
      v.y += randRange(0.5, 2.6);
      v.z += randRange(-1.6, 1.6);
      this.emit({
        pos: pos.clone(),
        vel: v,
        life: randRange(0.35, 0.8),
        maxLife: 0.8,
        size: randRange(2.2, 4.4),
        color: new THREE.Color().setHSL(randRange(0.0, 0.03), 0.9, randRange(0.22, 0.38)),
        gravity: 9.8,
        drag: 1.2,
      });
    }
  }

  gib(pos: THREE.Vector3, amount = 26): void {
    for (let i = 0; i < amount; i++) {
      const v = new THREE.Vector3(randRange(-3.4, 3.4), randRange(1.5, 5.5), randRange(-3.4, 3.4));
      this.emit({
        pos: pos.clone(),
        vel: v,
        life: randRange(0.5, 1.1),
        maxLife: 1.1,
        size: randRange(2.6, 5.4),
        color: new THREE.Color().setHSL(randRange(0.0, 0.05), 0.85, randRange(0.16, 0.3)),
        gravity: 10.5,
        drag: 0.6,
      });
    }
  }

  sparks(pos: THREE.Vector3, normalDir: THREE.Vector3, amount = 8): void {
    for (let i = 0; i < amount; i++) {
      const v = normalDir.clone().multiplyScalar(randRange(1, 3.5));
      v.x += randRange(-2.4, 2.4);
      v.y += randRange(0.2, 2.8);
      v.z += randRange(-2.4, 2.4);
      this.emit({
        pos: pos.clone(),
        vel: v,
        life: randRange(0.12, 0.4),
        maxLife: 0.4,
        size: randRange(1.4, 2.6),
        color: new THREE.Color().setHSL(randRange(0.08, 0.14), 1, randRange(0.55, 0.78)),
        gravity: 7,
        drag: 2.5,
      });
    }
  }

  dust(pos: THREE.Vector3, amount = 10): void {
    for (let i = 0; i < amount; i++) {
      this.emit({
        pos: pos.clone().add(new THREE.Vector3(randRange(-0.3, 0.3), randRange(0, 0.3), randRange(-0.3, 0.3))),
        vel: new THREE.Vector3(randRange(-0.5, 0.5), randRange(0.2, 0.9), randRange(-0.5, 0.5)),
        life: randRange(0.5, 1.2),
        maxLife: 1.2,
        size: randRange(3, 6),
        color: new THREE.Color(0.5, 0.45, 0.33),
        gravity: -0.15,
        drag: 2.8,
      });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, kind: WeaponKind = 'pistol'): void {
    const mesh = this.tracerPool.find((m) => !m.visible);
    if (!mesh) return;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (kind === 'shotgun') {
      mat.color.setHex(0xffc887);
      mesh.scale.set(2.2, 2.2, len * 0.55);
    } else if (kind === 'smg') {
      mat.color.setHex(0xfff3cf);
      mesh.scale.set(0.8, 0.8, len);
    } else {
      mat.color.setHex(0xffe2a8);
      mesh.scale.set(1.2, 1.2, len);
    }
    mesh.position.copy(from);
    mesh.lookAt(to);
    mesh.visible = true;
    mat.opacity = 0.9;
    this.tracers.push({ mesh, life: 0.09, maxLife: 0.09 });
  }

  update(dt: number, camera?: THREE.Camera): void {
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      const dragF = Math.exp(-p.drag * dt);
      p.vel.multiplyScalar(dragF);
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.02) {
        p.pos.y = 0.02;
        p.vel.y = Math.abs(p.vel.y) * 0.25;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
    }
    let n = 0;
    for (const p of this.particles) {
      this.posAttr.setXYZ(n, p.pos.x, p.pos.y, p.pos.z);
      const fade = Math.min(1, p.life / (p.maxLife * 0.5));
      this.colAttr.setXYZ(n, p.color.r * fade, p.color.g * fade, p.color.b * fade);
      this.sizeAttr.setX(n, p.size * (0.5 + fade * 0.5));
      n++;
    }
    this.geom.setDrawRange(0, n);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;

    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      const mat = t.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, t.life / t.maxLife) * 0.9;
      if (t.life <= 0) {
        t.mesh.visible = false;
        this.tracers.splice(i, 1);
      }
    }

    // impact flashes — billboard toward camera
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const mat = f.mesh.material as THREE.MeshBasicMaterial;
      const k = Math.max(0, f.life / f.maxLife);
      mat.opacity = k;
      f.mesh.scale.multiplyScalar(1 + dt * 3);
      if (camera) f.mesh.quaternion.copy(camera.quaternion);
      f.mesh.rotateZ(dt * 6);
      if (f.life <= 0) {
        f.mesh.visible = false;
        this.flashes.splice(i, 1);
      }
    }

    // pooled light decay
    if (this.boomT > 0) {
      this.boomT -= dt;
      const k = Math.max(0, this.boomT / 0.09);
      this.boomLight.intensity = this.boomMax * k;
    } else {
      this.boomLight.intensity = 0;
    }
  }

  clear(): void {
    this.particles.length = 0;
    this.geom.setDrawRange(0, 0);
    for (const t of this.tracers) t.mesh.visible = false;
    this.tracers.length = 0;
    for (const f of this.flashes) f.mesh.visible = false;
    this.flashes.length = 0;
    this.boomLight.intensity = 0;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geom.dispose();
    (this.points.material as THREE.Material).dispose();
    ((this.points.material as THREE.ShaderMaterial).uniforms.map.value as THREE.Texture).dispose();
    this.tracerPool.forEach((m) => {
      this.scene.remove(m);
      (m.material as THREE.Material).dispose();
    });
    this.tracerPool[0]?.geometry.dispose();
    this.flashPool.forEach((m) => {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.flashTex.dispose();
    this.scene.remove(this.boomLight);
  }
}
