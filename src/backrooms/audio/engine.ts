import { randRange } from '../core/math';
import type { AssetStore } from '../assets/assets';

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode;
  sfxBus: GainNode;
  ambienceBus: GainNode;
  assets: AssetStore | null = null;
  private convolver: ConvolverNode;
  private wetGain: GainNode;
  private humNodes: OscillatorNode[] = [];
  private noiseBuf: AudioBuffer;
  private started = false;
  volume = 0.8;

  constructor() {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.makeReverbIR(1.8, 2.2);
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.25;
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(this.convolver);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.5;
    this.ambienceBus.connect(this.master);

    this.noiseBuf = this.makeNoiseBuffer(2);
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 987654321;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = s / 0x3fffffff - 1;
    }
    return buf;
  }

  private makeReverbIR(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
    if (!this.started) {
      this.started = true;
      this.startHum();
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private startHum(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.045;
    humGain.connect(this.ambienceBus);

    for (const mult of [1, 2, 3]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 60 * mult;
      const g = ctx.createGain();
      g.gain.value = mult === 1 ? 0.9 : mult === 2 ? 0.35 : 0.12;
      osc.connect(g);
      g.connect(humGain);
      osc.start();
      this.humNodes.push(osc);
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    src.connect(lp);
    lp.connect(ng);
    ng.connect(this.ambienceBus);
    src.start();
  }

  setTension(t: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.ambienceBus.gain.setTargetAtTime(0.5 + t * 0.3, now, 0.5);
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseShot(t: number, dur: number, filterType: BiquadFilterType, freq: number, peak: number, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = randRange(0.9, 1.1);
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    this.env(g, t, 0.002, peak, dur);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, type: OscillatorType, t: number, a: number, peak: number, d: number, slideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + a + d);
    const g = ctx.createGain();
    o.connect(g);
    g.connect(this.sfxBus);
    this.env(g, t, a, peak, d);
    o.start(t);
    o.stop(t + a + d + 0.05);
  }

  playSample(buf: AudioBuffer | undefined, gain = 1, rate = 1, toReverb = true): boolean {
    if (!buf || !this.ctx || this.ctx.state !== 'running') return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.sfxBus);
    if (toReverb) g.connect(this.convolver);
    src.start();
    return true;
  }

  gunshot(kind: 'pistol' | 'smg' | 'shotgun'): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const A = this.assets;
    if (kind === 'pistol') {
      if (A && this.playSample(A.pick('pistol_fire', 1), 0.9, randRange(1.35, 1.5))) return;
      this.playSample(A?.buffers['rifle_fire1'], 0.9, randRange(1.3, 1.45));
      const t = this.ctx.currentTime;
      this.noiseShot(t, 0.10, 'highpass', 900, 0.35);
      this.tone(180, 'square', t, 0.002, 0.18, 0.07, 50);
    } else if (kind === 'smg') {
      if (A && this.playSample(A.pick('smg_fire', 4), 0.75, randRange(0.95, 1.08))) return;
      const t = this.ctx.currentTime;
      this.noiseShot(t, 0.09, 'highpass', 900, 0.72);
      this.tone(200, 'square', t, 0.001, 0.4, 0.06, 60);
    } else {
      const fired = A ? this.playSample(A.pick('smg_fire', 4), 1.0, randRange(0.6, 0.7)) : false;
      this.playSample(A?.buffers['rifle_fire2'], 0.8, randRange(0.8, 0.9));
      const t = this.ctx.currentTime;
      this.noiseShot(t, 0.28, 'highpass', 300, fired ? 0.25 : 1.0);
      this.noiseShot(t, 0.12, 'bandpass', 1400, 0.5, 1.5);
      this.tone(85, 'square', t, 0.002, 0.55, 0.22, 30);
    }
  }

  dryFire(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.playSample(this.assets?.buffers['dryfire'], 0.9)) return;
    const t = this.ctx.currentTime;
    this.noiseShot(t, 0.03, 'bandpass', 2400, 0.25, 3);
  }

  reload(kind: 'pistol' | 'smg' | 'shotgun'): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const map = { pistol: 'reload_pistol', smg: 'reload_smg', shotgun: 'reload_rifle' } as const;
    if (this.playSample(this.assets?.buffers[map[kind]], 0.9)) return;
    const t = this.ctx.currentTime;
    this.noiseShot(t, 0.05, 'bandpass', 1400, 0.35, 2);
    this.noiseShot(t + 0.25, 0.05, 'bandpass', 900, 0.4, 2);
    this.noiseShot(t + 0.55, 0.06, 'bandpass', 2000, 0.45, 3);
  }

  weaponSwitch(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.playSample(this.assets?.buffers['switch'], 0.7)) return;
    const t = this.ctx.currentTime;
    this.tone(1400, 'square', t, 0.001, 0.10, 0.03);
  }

  raise(kind: 'pistol' | 'smg' | 'shotgun'): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const map = { pistol: 'raise_pistol', smg: 'raise_smg', shotgun: 'raise_rifle' } as const;
    this.playSample(this.assets?.buffers[map[kind]], 0.8);
  }

  hitFlesh(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const A = this.assets;
    const n = 1 + Math.floor(Math.random() * 3);
    if (this.playSample(A?.buffers[`flesh${n}`], 0.85)) return;
    this.hitmarker();
  }

  hitWall(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const A = this.assets;
    const n = 1 + Math.floor(Math.random() * 3);
    if (this.playSample(A?.buffers[`ric${n}`], 0.5, randRange(0.9, 1.15), false)) return;
  }

  footstep(sprinting: boolean): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const A = this.assets;
    const n = 1 + Math.floor(Math.random() * 8);
    const buf = A?.buffers[`step${n}`];
    if (this.playSample(buf, sprinting ? 0.8 : 0.55, sprinting ? 1.12 : randRange(0.92, 1.05), false)) return;
    const t = this.ctx.currentTime;
    this.noiseShot(t, 0.07, 'lowpass', sprinting ? 500 : 380, sprinting ? 0.26 : 0.16);
  }

  hitmarker(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.tone(2200, 'sine', t, 0.001, 0.25, 0.05);
  }

  headshotDing(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.tone(2800, 'sine', t, 0.001, 0.3, 0.09);
    this.tone(3720, 'sine', t + 0.05, 0.001, 0.2, 0.09);
  }

  zombieDeath(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.tone(randRange(130, 170), 'sawtooth', t, 0.01, 0.3, 0.4, 45);
    this.noiseShot(t, 0.25, 'lowpass', 500, 0.3);
  }

  zombieGrowl(dist: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const att = Math.max(0.05, 1 - dist / 26);
    this.tone(randRange(70, 110), 'sawtooth', t, 0.08, 0.22 * att, 0.5, randRange(50, 70));
    this.noiseShot(t, 0.4, 'lowpass', 300 * att + 120, 0.12 * att);
  }

  playerHurt(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.tone(220, 'triangle', t, 0.01, 0.4, 0.15, 90);
    this.noiseShot(t, 0.2, 'bandpass', 600, 0.3);
  }

  uiClick(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.tone(1400, 'square', t, 0.001, 0.10, 0.03);
  }

  uiConfirm(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.tone(880, 'square', t, 0.001, 0.12, 0.05);
    this.tone(1320, 'square', t + 0.06, 0.001, 0.12, 0.06);
  }

  waveStart(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.tone(70 + i * 12, 'sawtooth', t + i * 0.35, 0.05, 0.3, 0.3, 50);
    }
  }

  escapeWin(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      this.tone(f, 'triangle', t + i * 0.12, 0.01, 0.2, 0.3);
    });
  }

  dispose(): void {
    this.humNodes.forEach((osc) => {
      try { osc.stop(); } catch { /* already stopped */ }
    });
    this.humNodes = [];
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
