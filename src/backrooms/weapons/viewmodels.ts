import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { WeaponSpec } from './weapons';

/**
 * Builds a first-person viewmodel from a GLB (Quaternius CC0 gun pack).
 * Returns the model group + local-space muzzle point for flashes/tracers.
 */
export async function buildGLBViewModel(
  _key: string,
  modelData: ArrayBuffer | undefined,
  spec: WeaponSpec,
): Promise<{ group: THREE.Group; muzzleLocal: THREE.Vector3 }> {
  // Fallback: tinted box model close to the old look.
  // muzzleLocal is in viewmodel-local space (added to the mount offset later).
  if (!modelData) {
    const g = buildFallbackViewModel(spec);
    const tip =
      spec.audio === 'shotgun'
        ? new THREE.Vector3(0, 0.035, -0.6)
        : spec.audio === 'smg'
          ? new THREE.Vector3(0, 0.02, -0.32)
          : new THREE.Vector3(0, 0.03, -0.28);
    return { group: g, muzzleLocal: tip };
  }

  const loader = new GLTFLoader();
  const gltf = await new Promise<GLTF & { scene: THREE.Group }>((resolve, reject) => {
    loader.parse(modelData.slice(0), '', (g) => resolve(g as GLTF & { scene: THREE.Group }), reject);
  });

  const root = gltf.scene;

  // Quaternius guns are modeled lying along +X (barrel toward +X).
  // FPS forward is -Z, so yaw +90° to map +X -> -Z.
  root.rotation.set(0, Math.PI / 2, 0);
  root.position.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());

  // Normalize overall length (now along Z after the yaw) per weapon class.
  const targetLen = spec.audio === 'pistol' ? 0.34 : spec.audio === 'smg' ? 0.42 : 0.55;
  const scale = targetLen / Math.max(size.z, 0.001);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  // Recenter the model on the viewmodel origin so the outer mount
  // offset (set by WeaponSystem) actually controls on-screen placement.
  box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.position.y += 0.02;
  root.updateMatrixWorld(true);

  // Find muzzle: farthest -Z vertex (barrel tip) in viewmodel-local space.
  let muzzle = new THREE.Vector3(0, 0.02, -targetLen / 2);
  let minZ = Infinity;
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 7) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.z < minZ) {
        minZ = v.z;
        muzzle.copy(v);
      }
    }
  });
  muzzle.z = Math.min(muzzle.z, -0.16);
  muzzle.x = THREE.MathUtils.clamp(muzzle.x, -0.08, 0.08);
  muzzle.y = THREE.MathUtils.clamp(muzzle.y, -0.06, 0.1);

  // Dark tactical material pass so they read well in dim light
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat) {
      mat.envMapIntensity = 0.4;
      mat.metalness = Math.min(0.85, (mat.metalness ?? 0.3) + 0.25);
      mat.roughness = Math.max(0.35, (mat.roughness ?? 0.7) - 0.15);
    }
  });

  // Wrap so WeaponSystem can move/rotate the outer mount without
  // clobbering the normalized centering stored on the inner model.
  const outer = new THREE.Group();
  outer.add(root);
  return { group: outer, muzzleLocal: muzzle };
}

/** Procedural fallback gun (previous box look) if GLB missing. */
function buildFallbackViewModel(spec: WeaponSpec): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.55, metalness: 0.65 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 0.9, metalness: 0.1 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (spec.audio === 'pistol') {
    add(new THREE.BoxGeometry(0.055, 0.09, 0.30), dark, 0, 0.02, -0.10);
    add(new THREE.BoxGeometry(0.045, 0.055, 0.24), dark, 0, -0.025, -0.08);
    add(new THREE.BoxGeometry(0.04, 0.11, 0.055), grip, 0, -0.08, 0.02).rotation.x = 0.22;
  } else if (spec.audio === 'smg') {
    add(new THREE.BoxGeometry(0.06, 0.11, 0.34), dark, 0, 0.01, -0.12);
    add(new THREE.BoxGeometry(0.035, 0.24, 0.045), grip, 0, -0.12, -0.02).rotation.x = 0.15;
    add(new THREE.BoxGeometry(0.04, 0.09, 0.05), grip, 0, -0.07, 0.08).rotation.x = 0.3;
  } else {
    add(new THREE.BoxGeometry(0.065, 0.10, 0.44), dark, 0, 0.01, -0.16);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 10), dark, 0, 0.035, -0.42).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.045, 0.10, 0.06), grip, 0, -0.07, 0.06).rotation.x = 0.28;
  }
  g.traverse((o: THREE.Object3D) => {
    o.castShadow = false;
    o.renderOrder = 10;
  });
  return g;
}
