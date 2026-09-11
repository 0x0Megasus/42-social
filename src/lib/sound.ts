// Tiny synthesized sound engine — zero deps, zero audio files.
// All sounds are short oscillator envelopes (cool, not annoying).

const MUTE_KEY = "42social-muted";

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(m: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    /* private mode */
  }
}

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

// Browsers suspend audio until a user gesture — call on first interaction.
export function unlockAudio(): void {
  const c = ac();
  if (c && c.state === "suspended") void c.resume().catch(() => null);
}

type Tone = {
  freq: number;
  freqEnd?: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
};

function tone(c: AudioContext, t: Tone): void {
  const o = c.createOscillator();
  const g = c.createGain();
  const start = c.currentTime + t.at;
  o.type = t.type ?? "sine";
  o.frequency.setValueAtTime(t.freq, start);
  if (t.freqEnd)
    o.frequency.exponentialRampToValueAtTime(t.freqEnd, start + t.dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(t.vol ?? 0.12, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(start);
  o.stop(start + t.dur + 0.05);
}

// Sound engine: downloaded files first, synthesized fallback if missing.
// Drop your files at (exact names, lowercase):
//   public/sounds/message.mp3      -> incoming DM pop
//   public/sounds/notification.mp3 -> likes / comments / follows chime
// MP3 works in every browser. Keep each file short (<1s) and small (<100KB).

const MESSAGE_SRC = "/sounds/message.mp3";
const NOTIF_SRC = "/sounds/notification.mp3";

const missing = new Set<string>();
const players = new Map<string, HTMLAudioElement>();

function playWithFallback(src: string, synth: () => void): void {
  if (isMuted()) return;
  unlockAudio();
  if (missing.has(src)) {
    synth();
    return;
  }
  try {
    let a = players.get(src);
    if (!a) {
      a = new Audio(src);
      a.preload = "auto";
      a.volume = 0.7;
      a.addEventListener("error", () => {
        missing.add(src);
        players.delete(src);
        synth();
      });
      players.set(src, a);
    }
    a.currentTime = 0;
    const p = a.play();
    if (p)
      p.catch(() => {
        missing.add(src);
        players.delete(src);
        synth();
      });
  } catch {
    synth();
  }
}

function synthReady(): AudioContext | null {
  const c = ac();
  if (!c || c.state !== "running") return null;
  return c;
}

/** Bright two-tone chime for likes / comments / follows. */
export function playNotification(): void {
  playWithFallback(NOTIF_SRC, () => {
    const c = synthReady();
    if (!c) return;
    tone(c, { freq: 987.77, at: 0, dur: 0.16, vol: 0.1 }); // B5
    tone(c, { freq: 1318.5, at: 0.11, dur: 0.32, vol: 0.12 }); // E6
  });
}

/** Soft rising pop for incoming DMs. */
export function playMessage(): void {
  playWithFallback(MESSAGE_SRC, () => {
    const c = synthReady();
    if (!c) return;
    tone(c, { freq: 520, freqEnd: 920, at: 0, dur: 0.15, vol: 0.1 });
  });
}

/** Tiny blip for UI feedback (unmute test). */
export function playBlip(): void {
  const c = synthReady();
  if (!c || isMuted()) return;
  tone(c, { freq: 740, at: 0, dur: 0.09, vol: 0.08 });
}
