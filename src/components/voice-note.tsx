"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Mic, Pause, Play, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatDuration,
  MEDIA_CAPS,
  peaksFromBlob,
  pickVoiceMime,
} from "@/lib/media";
import { cn } from "@/lib/utils";

export type VoiceClip = {
  blob: Blob;
  url: string;
  duration: number;
  peaks: number[];
  mime: string;
};

export function VoiceRecorder({
  disabled,
  onReady,
  onPreviewing,
}: {
  disabled?: boolean;
  onReady: (clip: VoiceClip) => void;
  onPreviewing?: (active: boolean) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<VoiceClip | null>(null);
  const stateRef = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    timer: ReturnType<typeof setInterval>;
    raf: number;
    analyser?: AnalyserNode;
    audioCtx?: AudioContext;
    startedAt: number;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    onPreviewing?.(preview !== null);
  }, [preview, onPreviewing]);

  function cleanup() {
    const s = stateRef.current;
    stateRef.current = null;
    if (!s) return;
    clearInterval(s.timer);
    cancelAnimationFrame(s.raf);
    try {
      s.recorder.stream.getTracks().forEach((t) => t.stop());
    } catch {
    }
    try {
      s.stream.getTracks().forEach((t) => t.stop());
    } catch {
    }
    void s.audioCtx?.close().catch(() => null);
  }

  useEffect(() => cleanup, []);

  function drawLevel() {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!s || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      if (!stateRef.current) return;
      const { analyser } = stateRef.current;
      let level = 0;
      if (analyser) {
        const buf = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 4) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        level = Math.min(1, Math.sqrt(sum / (buf.length / 4)) * 2.4);
      }
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#ED4245";
      const bw = Math.max(2, (w / 24) * level);
      for (let i = 0; i < 24; i++) {
        const bh = 3 + (h - 6) * (i % 5 === 0 ? level : level * 0.55);
        ctx.fillRect(i * (w / 24), (h - bh) / 2, bw, bh);
      }
      stateRef.current.raf = requestAnimationFrame(draw);
    };
    draw();
  }

  async function start() {
    if (recording || disabled) return;
    const mime = pickVoiceMime();
    if (!mime) {
      toast.error("Voice recording isn't supported in this browser.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone blocked — allow access to record.");
      return;
    }
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: MEDIA_CAPS.voiceBitrate,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setElapsed(s);
        if (s >= MEDIA_CAPS.voiceMaxSeconds) void stop(true);
      }, 250);
      stateRef.current = {
        recorder,
        stream,
        chunks,
        timer,
        raf: 0,
        startedAt,
      };
      try {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AC) {
          const audioCtx = new AC();
          const src = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          src.connect(analyser);
          stateRef.current.audioCtx = audioCtx;
          stateRef.current.analyser = analyser;
        }
      } catch {
      }
      recorder.start(250);
      setRecording(true);
      setElapsed(0);
      drawLevel();
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      toast.error("Couldn't start recording.");
    }
  }

  async function stop(send: boolean) {
    const s = stateRef.current;
    if (!s) return;
    const { recorder, chunks } = s;
    const duration = Math.max(
      1,
      Math.round((Date.now() - s.startedAt) / 1000)
    );
    cleanup();
    setRecording(false);
    if (!send) return;
    const mime =
      recorder.mimeType || pickVoiceMime() || "audio/webm";
    const blob = new Blob(chunks, { type: mime });
    if (blob.size < 1000) {
      toast.error("Too short — hold to record.");
      return;
    }
    const peaks = await peaksFromBlob(blob);
    setPreview({
      blob,
      url: URL.createObjectURL(blob),
      duration,
      peaks,
      mime,
    });
  }

  if (preview) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2 rounded-[2px] border border-[#5865F2]/40 bg-[#09090B] px-2.5 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5865F2]/15 text-[#5865F2]">
          <Mic size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <VoicePlayer
            url={preview.url}
            duration={preview.duration}
            peaks={preview.peaks}
          />
        </span>
        <button
          type="button"
          aria-label="Discard voice note"
          onClick={() => {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#949BA4] transition-colors hover:bg-white/10 hover:text-[#ED4245]"
        >
          <Trash2 size={15} />
        </button>
        <button
          type="button"
          aria-label="Send voice note"
          onClick={() => {
            onReady(preview);
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white transition-transform hover:scale-105 hover:brightness-110"
        >
          <Send size={14} />
        </button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {recording && (
        <span className="flex items-center gap-1.5 rounded-[2px] border border-[#3F3F46] bg-[#09090B] px-2 py-1.5">
          <canvas ref={canvasRef} width={72} height={20} aria-hidden />
          <span className="font-mono text-[11px] tabular-nums text-[#ED4245]">
            {formatDuration(elapsed)}
          </span>
        </span>
      )}
      <button
        type="button"
        aria-label={recording ? "Release to send" : "Hold to record voice note"}
        title="Hold to record voice note"
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault();
          void start();
        }}
        onPointerUp={() => void stop(true)}
        onPointerLeave={() => {
          if (recording) void stop(false);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "flex h-9 w-9 touch-none items-center justify-center rounded-[2px] transition-colors disabled:opacity-30",
          recording
            ? "bg-[#ED4245] text-white"
            : "text-[#B5BAC1] hover:bg-white/10 hover:text-white"
        )}
      >
        <Mic size={16} />
      </button>
    </span>
  );
}

let voiceSeq = 0;

export function VoicePlayer({
  url,
  duration,
  peaks,
}: {
  url: string;
  duration: number | null;
  peaks: number[] | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const idRef = useRef(`voice-${++voiceSeq}-${Math.random().toString(36).slice(2, 8)}`);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const bars = peaks && peaks.length > 0 ? peaks : new Array(28).fill(0.4);
  const total = duration ?? undefined;

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== idRef.current) {
        audioRef.current?.pause();
      }
    };
    window.addEventListener("voice-play", onOther);
    return () => window.removeEventListener("voice-play", onOther);
  }, []);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else {
      window.dispatchEvent(new CustomEvent("voice-play", { detail: idRef.current }));
      void el.play().catch(() => null);
    }
  }

  return (
    <span className="flex min-w-0 items-center gap-2 py-1">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setAt(0);
        }}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white hover:brightness-110"
      >
        {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>
      <button
        type="button"
        onClick={(e) => {
          const el = audioRef.current;
          const bar = e.currentTarget;
          if (!el || !total) return;
          const r = bar.getBoundingClientRect();
          const ratio = Math.min(
            1,
            Math.max(0, (e.clientX - r.left) / r.width)
          );
          el.currentTime = ratio * total;
          setAt(el.currentTime);
        }}
        aria-label="Seek voice note"
        className="flex min-w-0 flex-1 items-end gap-[2px]"
      >
        {bars.map((p, i) => {
          const played = total ? at / total >= (i + 1) / bars.length : false;
          return (
            <span
              key={i}
              style={{ height: `${4 + p * 20}px` }}
              className={cn(
                "w-full min-w-[2px] rounded-full",
                played ? "bg-[#5865F2]" : "bg-[#4E5058]"
              )}
            />
          );
        })}
      </button>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#949BA4]">
        {formatDuration(total ? Math.max(0, total - at) : 0)}
      </span>
    </span>
  );
}
