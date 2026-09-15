import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  NoiseEffect,
  ChromaticAberrationEffect,
  ScanlineEffect,
  ToneMappingEffect,
  ToneMappingMode,
  BlendFunction,
  KernelSize,
} from 'postprocessing';
import * as THREE from 'three';

/** The VHS/horror grade: bloom on lamps, grain, scanlines, vignette, chroma fringe. */
export class PostFX {
  composer: EffectComposer;
  private chroma: ChromaticAberrationEffect;
  private noise: NoiseEffect;
  private scan: ScanlineEffect;
  private vignette: VignetteEffect;
  private bloom: BloomEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new BloomEffect({
      intensity: 0.65,
      luminanceThreshold: 0.55,
      luminanceSmoothing: 0.35,
      kernelSize: KernelSize.MEDIUM,
    });

    this.chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0006, 0.0006),
      radialModulation: true,
      modulationOffset: 0.35,
    });

    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
    this.noise.blendMode.opacity.value = 0.16;

    this.scan = new ScanlineEffect({ density: 0.62, blendFunction: BlendFunction.OVERLAY });
    this.scan.blendMode.opacity.value = 0.07;

    this.vignette = new VignetteEffect({ eskil: false, offset: 0.22, darkness: 0.85 });

    this.composer.addPass(
      new EffectPass(camera, this.bloom, this.chroma, this.noise, this.scan, this.vignette, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })),
    );
  }

  /** Damage/hurt red push 0..1 */
  setHurt(v: number): void {
    this.chroma.offset.set(0.0006 + v * 0.004, 0.0006 + v * 0.004);
    this.noise.blendMode.opacity.value = 0.16 + v * 0.25;
    this.vignette.darkness = Math.min(1.6, 0.85 + v * 0.8);
  }

  /** Sanity/tension 0..1 — raises grain and chroma creep. */
  setTension(v: number): void {
    this.noise.blendMode.opacity.value = 0.16 + v * 0.1;
    this.chroma.offset.set(0.0006 + v * 0.0015, 0.0006 + v * 0.0015);
  }

  update(_dt: number): void {
    // reserved for animated uniforms
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
