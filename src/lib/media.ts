"use client";

// Browser media pipeline: compress → quota-check → direct-to-Storage
// upload → report. Uploads NEVER transit Next.js (no server body limits,
// no server bandwidth burn) — RTDB stores only tiny metadata afterwards.
//
// Budgets (free-tier friendly):
// - images: longest edge ≤1600px, WebP q0.85 (~100–300 KB) + 320px thumb
// - video: ≤60 s / ≤50 MB, 480p pass only when WebCodecs exists (else orig)
// - voice: Opus ~32 kbps (~200 KB/min), ≤3 min

export const MEDIA_CAPS = {
  imageMaxEdge: 1600,
  imageQuality: 0.85,
  thumbEdge: 320,
  videoMaxSeconds: 60,
  videoMaxBytes: 50 * 1024 * 1024,
  voiceMaxSeconds: 180,
  voiceBitrate: 32_000,
  imageMaxBytes: 10 * 1024 * 1024,
  voiceMaxBytes: 8 * 1024 * 1024,
} as const;

// Mirrors MediaKind in lib/db.ts (duplicated, not imported — db.ts pulls
// firebase-admin, which must never enter the browser bundle).
export type MediaKind = "image" | "video" | "voice";

export type MediaConfig = {
  cloud: string | null;
  presetImage: string | null;
  presetMedia: string | null;
};

export type MediaStatus = { ready: boolean; missing: string[] };

let configCache: MediaConfig | null | undefined;

// Runtime config from the server (fresh per page load — no rebuild needed
// after configuring env, and failures name exactly what's missing).
async function getMediaConfig(): Promise<MediaConfig | null> {
  if (configCache !== undefined) return configCache;
  try {
    const res = await fetch("/api/media/config", { cache: "no-store" });
    configCache = res.ok ? ((await res.json()) as MediaConfig) : null;
  } catch {
    configCache = null;
  }
  return configCache;
}

export async function mediaStatus(): Promise<MediaStatus> {
  const cfg = await getMediaConfig();
  const missing: string[] = [];
  if (!cfg?.cloud) missing.push("cloud name");
  if (!cfg?.presetImage) missing.push("image preset");
  if (!cfg?.presetMedia) missing.push("media preset");
  return { ready: missing.length === 0, missing };
}

export async function mediaReady(): Promise<boolean> {
  return (await mediaStatus()).ready;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---- image compression (canvas, zero deps) ----

export type CompressedImage = {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
};

function drawTo(
  img: HTMLImageElement,
  maxEdge: number,
  type: string,
  quality: number
): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(
    1,
    maxEdge / Math.max(img.naturalWidth, img.naturalHeight)
  );
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-2d-context");
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve({ blob: b, w, h }) : reject(new Error("encode-failed"))),
      type,
      quality
    )
  );
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) throw new Error("not-image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode-failed"));
      el.src = url;
    });
    // Prefer WebP; fall back to the source type when unsupported.
    let full: { blob: Blob; w: number; h: number };
    try {
      full = await drawTo(img, MEDIA_CAPS.imageMaxEdge, "image/webp", MEDIA_CAPS.imageQuality);
    } catch {
      full = await drawTo(img, MEDIA_CAPS.imageMaxEdge, file.type || "image/jpeg", 0.9);
    }
    // GIFs stay animated: never transcode, only pass through if small.
    if (file.type === "image/gif") {
      if (file.size > MEDIA_CAPS.imageMaxBytes) throw new Error("too-large");
      const thumb = await drawTo(img, MEDIA_CAPS.thumbEdge, "image/webp", 0.8).catch(() => null);
      return {
        blob: file,
        thumb: thumb?.blob ?? file,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
    }
    if (full.blob.size > MEDIA_CAPS.imageMaxBytes) throw new Error("too-large");
    const thumb = await drawTo(img, MEDIA_CAPS.thumbEdge, "image/webp", 0.8);
    return { blob: full.blob, thumb: thumb.blob, width: full.w, height: full.h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- video validation + thumbnail ----

export async function probeVideo(file: File): Promise<{
  ok: boolean;
  error?: string;
  duration?: number;
}> {
  if (!file.type.startsWith("video/")) return { ok: false, error: "not-video" };
  if (file.size > MEDIA_CAPS.videoMaxBytes)
    return { ok: false, error: `over ${formatBytes(MEDIA_CAPS.videoMaxBytes)}` };
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () => resolve(v.duration);
      v.onerror = () => reject(new Error("decode-failed"));
      v.src = url;
    });
    if (!Number.isFinite(duration))
      return { ok: true, duration: undefined };
    if (duration > MEDIA_CAPS.videoMaxSeconds + 1)
      return { ok: false, error: `over ${MEDIA_CAPS.videoMaxSeconds}s` };
    return { ok: true, duration };
  } catch {
    // Undecodable here ≠ unplayable elsewhere — allow upload, server caps size.
    return { ok: true, duration: undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function captureVideoThumb(
  file: File
): Promise<{ blob: Blob; w: number; h: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const frame = await new Promise<HTMLVideoElement>((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.onseeked = () => resolve(v);
      v.onerror = () => reject(new Error("thumb-failed"));
      v.src = url;
    });
    try {
      frame.currentTime = Math.min(0.5, (frame.duration || 1) / 3);
      await new Promise<void>((resolve, reject) => {
        const to = setTimeout(() => reject(new Error("thumb-timeout")), 4000);
        frame.onseeked = () => {
          clearTimeout(to);
          resolve();
        };
      });
    } catch {
      /* first frame is fine */
    }
    const scale = Math.min(
      1,
      MEDIA_CAPS.thumbEdge / Math.max(frame.videoWidth, frame.videoHeight)
    );
    const w = Math.max(1, Math.round(frame.videoWidth * scale));
    const h = Math.max(1, Math.round(frame.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(frame, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.8)
    );
    return blob ? { blob, w, h } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- voice helpers ----

export function pickVoiceMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* try next */
    }
  }
  return "";
}

export async function peaksFromBlob(blob: Blob, bars = 32): Promise<number[]> {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return new Array(bars).fill(0.4);
  try {
    const ctx = new Ctx();
    const buf = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);
    void ctx.close().catch(() => null);
    const ch = audio.getChannelData(0);
    const out: number[] = [];
    const step = Math.max(1, Math.floor(ch.length / bars));
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * step;
      for (let j = start; j < Math.min(start + step, ch.length); j += 7) {
        const a = Math.abs(ch[j]);
        if (a > peak) peak = a;
      }
      out.push(Math.min(1, Math.round(peak * 100) / 100));
    }
    return out;
  } catch {
    return new Array(bars).fill(0.4);
  }
}

// ---- upload (direct browser → Cloudinary unsigned preset, XHR progress) ----

export type UploadedFile = {
  url: string;
  publicId: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
};

export async function uploadFile(
  scope: "posts" | "videos" | "voice",
  uid: string,
  file: Blob,
  onProgress?: (ratio: number) => void
): Promise<UploadedFile> {
  const kind: MediaKind =
    scope === "posts" ? "image" : scope === "videos" ? "video" : "voice";
  // Endpoint + preset come from the live server config (never build-time
  // env), so misconfiguration surfaces as a named error, not silence.
  const cfg = await getMediaConfig();
  const preset = kind === "image" ? cfg?.presetImage : cfg?.presetMedia;
  if (!cfg?.cloud || !preset) {
    throw new Error(
      `media-unconfigured: ${!cfg?.cloud ? "cloud name" : kind === "image" ? "image preset" : "media preset"}`
    );
  }
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const publicId = `42social/${uid}/${stamp}_${rand}`;
  // Server quota gate first (also registers the pending marker the orphan
  // sweep uses if this tab dies mid-upload).
  const quota = await checkQuota(kind, file.size, publicId);
  if (!quota.ok) throw new Error(quota.error ?? "quota");
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", preset);
  form.append("public_id", publicId);
  const resource = kind === "image" ? "image" : "video";
  const res = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${cfg.cloud}/${resource}/upload`
    );
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable && e.total > 0)
        onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("bad-upload-response"));
        }
      } else {
        reject(new Error("upload-failed"));
      }
    };
    xhr.onerror = () => reject(new Error("upload-failed"));
    xhr.send(form);
  });
  const url = res.secure_url ?? res.url;
  if (typeof url !== "string") throw new Error("upload-failed");
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  await reportUpload({
    publicId: typeof res.public_id === "string" ? res.public_id : publicId,
    url,
    bytes: num(res.bytes) ?? file.size,
    kind,
  });
  return {
    url,
    publicId: typeof res.public_id === "string" ? res.public_id : publicId,
    bytes: num(res.bytes) ?? file.size,
    width: num(res.width),
    height: num(res.height),
    duration: num(res.duration),
  };
}

// ---- server quota gate + completion report ----

export async function checkQuota(
  kind: MediaKind,
  bytes: number,
  publicId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/media/quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, bytes, publicId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { ok: false, error: d?.error ?? "quota" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "quota-check-failed" };
  }
}

export async function reportUpload(input: {
  publicId: string;
  url: string;
  bytes: number;
  kind: MediaKind;
}): Promise<void> {
  await fetch("/api/media/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => null);
}
