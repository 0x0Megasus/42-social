"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

// Custom video player in the app's dark language: poster until first play,
// tap-to-toggle, seek bar, time, mute, fullscreen. `suspended` pauses
// playback from outside (e.g. comments opened on the same post). `aspect`
// ("W / H" from the stored upload dims) reserves the frame before metadata
// loads so the feed never jumps; the video itself always keeps its ratio.
export function VideoPlayer({
  src,
  poster,
  suspended,
  aspect,
}: {
  src: string;
  poster?: string | null;
  suspended?: boolean;
  aspect?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);
  const [hover, setHover] = useState(false);
  // Touch devices have no hover — controls stay put there; on hover-capable
  // devices they fade out while playing once the cursor leaves.
  const [hoverable] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover)").matches
  );
  const controlsHidden = started && playing && hoverable && !hover;

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  useEffect(() => {
    if (suspended) pause();
  }, [suspended, pause]);

  function toggle() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => null);
    else el.pause();
  }

  function seek(clientX: number) {
    const el = videoRef.current;
    const bar = wrapRef.current?.querySelector<HTMLElement>("[data-seek]");
    if (!el || !bar || !dur) return;
    const r = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    el.currentTime = ratio * dur;
    setAt(el.currentTime);
  }

  function fullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => null);
    else void el.requestFullscreen?.().catch(() => null);
  }

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative mt-3 overflow-hidden rounded-xl bg-black"
      style={aspect ? { aspectRatio: aspect, maxHeight: 480 } : undefined}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        playsInline
        preload="metadata"
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        className={cn(
          "mx-auto block h-auto max-h-[480px] w-auto max-w-full cursor-pointer bg-black object-contain",
          controlsHidden && "cursor-none"
        )}
      />
      {!started && (
        <button
          onClick={toggle}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-transform hover:scale-105">
            <Play size={22} fill="currentColor" />
          </span>
        </button>
      )}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 transition-opacity duration-200",
          controlsHidden && "pointer-events-none opacity-0"
        )}
      >
        <div
          data-seek
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(at)}
          tabIndex={0}
          onKeyDown={(e) => {
            const el = videoRef.current;
            if (!el) return;
            if (e.key === "ArrowRight") el.currentTime = Math.min(dur, at + 5);
            if (e.key === "ArrowLeft") el.currentTime = Math.max(0, at - 5);
          }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            seek(e.clientX);
            const move = (ev: PointerEvent) => seek(ev.clientX);
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
          className="flex h-4 cursor-pointer items-center"
        >
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-cyan-400"
              style={{ width: `${dur ? (at / dur) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10"
          >
            {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
          <button
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              el.muted = !el.muted;
              setMuted(el.muted);
            }}
            aria-label={muted ? "Unmute" : "Mute"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-white/80">
            {fmt(at)} / {fmt(dur)}
          </span>
          <button
            onClick={fullscreen}
            aria-label="Fullscreen"
            className={cn(
              "ml-auto flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10"
            )}
          >
            <Maximize size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
