
export type AssetBuffers = Record<string, AudioBuffer>;
export type AssetModels = Record<string, ArrayBuffer>;

const SFX_MANIFEST: Record<string, string> = {
  pistol_fire: '/backrooms/sfx/pistol_fire.opus',
  pistol_fire2: '/backrooms/sfx/pistol_fire2.opus',
  smg_fire1: '/backrooms/sfx/smg_fire1.opus',
  smg_fire2: '/backrooms/sfx/smg_fire2.opus',
  smg_fire3: '/backrooms/sfx/smg_fire3.opus',
  smg_fire4: '/backrooms/sfx/smg_fire4.opus',
  rifle_fire1: '/backrooms/sfx/rifle_fire1.opus',
  rifle_fire2: '/backrooms/sfx/rifle_fire2.opus',
  rifle_fire3: '/backrooms/sfx/rifle_fire3.opus',
  rifle_fire0: '/backrooms/sfx/rifle_fire0.opus',
  reload_rifle: '/backrooms/sfx/reload_rifle.opus',
  reload_smg: '/backrooms/sfx/reload_smg.opus',
  reload_pistol: '/backrooms/sfx/reload_pistol.opus',
  dryfire: '/backrooms/sfx/dryfire.opus',
  switch: '/backrooms/sfx/switch.opus',
  raise_rifle: '/backrooms/sfx/raise_rifle.opus',
  raise_smg: '/backrooms/sfx/raise_smg.opus',
  raise_pistol: '/backrooms/sfx/raise_pistol.opus',
  step1: '/backrooms/sfx/step1.opus',
  step2: '/backrooms/sfx/step2.opus',
  step3: '/backrooms/sfx/step3.opus',
  step4: '/backrooms/sfx/step4.opus',
  step5: '/backrooms/sfx/step5.opus',
  step6: '/backrooms/sfx/step6.opus',
  step7: '/backrooms/sfx/step7.opus',
  step8: '/backrooms/sfx/step8.opus',
  flesh1: '/backrooms/sfx/flesh1.opus',
  flesh2: '/backrooms/sfx/flesh2.opus',
  flesh3: '/backrooms/sfx/flesh3.opus',
  ric1: '/backrooms/sfx/ric1.opus',
  ric2: '/backrooms/sfx/ric2.opus',
  ric3: '/backrooms/sfx/ric3.opus',
};

const MODEL_MANIFEST: Record<string, string> = {
  pistol: '/backrooms/models/guns/pistol.glb',
  smg: '/backrooms/models/guns/smg.glb',
  ar: '/backrooms/models/guns/ar.glb',
  zombie_shambler: '/backrooms/models/zombies/zombie_shambler.glb',
  zombie_runner: '/backrooms/models/zombies/zombie_runner.glb',
  zombie_brute: '/backrooms/models/zombies/zombie_brute.glb',
};

export type LoadProgress = (loaded: number, total: number, label: string) => void;

export class AssetStore {
  buffers: AssetBuffers = {};
  models: AssetModels = {};
  soundsOk = false;
  modelsOk = false;
  private ctx: AudioContext;

  constructor(ctx: AudioEngineCtx) {
    this.ctx = ctx as unknown as AudioContext;
  }

  async loadAll(onProgress: LoadProgress): Promise<void> {
    const soundEntries = Object.entries(SFX_MANIFEST);
    const modelEntries = Object.entries(MODEL_MANIFEST);
    const total = soundEntries.length + modelEntries.length;
    let done = 0;

    const ctx = this.ctx;
    const step = (label: string) => {
      done++;
      onProgress(done, total, label);
    };

    await Promise.all(
      soundEntries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          const ab = await res.arrayBuffer();
          this.buffers[key] = await ctx.decodeAudioData(ab);
        } catch {
        }
        step(key);
      }),
    );

    await Promise.all(
      modelEntries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          this.models[key] = await res.arrayBuffer();
        } catch {
        }
        step(key);
      }),
    );

    this.soundsOk = Object.keys(this.buffers).length > 0;
    this.modelsOk = Object.keys(this.models).length === modelEntries.length;
  }

  pick(prefix: string, variants: number): AudioBuffer | undefined {
    if (variants <= 1) return this.buffers[prefix];
    const n = 1 + Math.floor(Math.random() * variants);
    return this.buffers[`${prefix}${n}`] ?? this.buffers[prefix];
  }
}

type AudioEngineCtx = {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
};
