"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  poster,
  suspended,
  aspect,
  duration,
}: {
  src: string;
  poster?: string | null;
  suspended?: boolean;
  aspect?: string | null;
  duration?: number | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [hover, setHover] = useState(false);
  const [hoverable, setHoverable] = useState(false);

  useEffect(() => {
    setHoverable(window.matchMedia("(hover: hover)").matches);
  }, []);
  const propDur = typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : 0;
  const effectiveDur = dur > 0 ? dur : propDur;
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
    if (!el || !bar || !effectiveDur) return;
    const r = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    el.currentTime = ratio * effectiveDur;
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
      className="group relative mt-3 w-full overflow-hidden rounded-2xl bg-zinc-950 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.85)]"
      style={aspect ? { aspectRatio: aspect, maxHeight: 520 } : undefined}
    >
      {poster ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl saturate-150"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-black/80" />
        </>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.18),transparent_55%),linear-gradient(to_bottom,rgba(0,0,0,0.55),rgba(0,0,0,0.15),rgba(0,0,0,0.8))]" />
      )}
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
          "relative z-10 mx-auto block h-full max-h-[520px] w-full cursor-pointer object-contain",
          controlsHidden && "cursor-none"
        )}
      />
      {!started && (
        <button
          onClick={toggle}
          aria-label="Play video"
          className="absolute inset-0 z-20 flex items-center justify-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white shadow-2xl ring-1 ring-white/30 backdrop-blur-md transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-black/65 active:scale-[0.97] [@media(hover:hover)]:hover:scale-[1.03]">
            <Play size={24} fill="currentColor" />
          </span>
        </button>
      )}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          controlsHidden && "pointer-events-none opacity-0"
        )}
      >
        <div
          data-seek
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(effectiveDur)}
          aria-valuenow={Math.round(Math.min(at, effectiveDur))}
          tabIndex={0}
          onKeyDown={(e) => {
            const el = videoRef.current;
            if (!el) return;
            if (e.key === "ArrowRight") el.currentTime = Math.min(effectiveDur, at + 5);
            if (e.key === "ArrowLeft") el.currentTime = Math.max(0, at - 5);
          }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setScrubbing(true);
            seek(e.clientX);
            const move = (ev: PointerEvent) => seek(ev.clientX);
            const up = () => {
              setScrubbing(false);
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
              window.removeEventListener("pointercancel", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            window.addEventListener("pointercancel", up);
          }}
          onPointerCancel={() => setScrubbing(false)}
          className="group/seek flex h-7 cursor-pointer touch-none select-none items-center"
        >
          <div className="relative h-2 w-full rounded-full bg-white/20 transition-colors duration-150 ease-out group-hover/seek:bg-white/30">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-300 to-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.65)]"
              style={{ width: `${effectiveDur ? Math.min(100, (at / effectiveDur) * 100) : 0}%` }}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute -right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 scale-75 rounded-full bg-white opacity-0 shadow transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/seek:scale-100 group-hover/seek:opacity-100 group-focus-visible/seek:scale-100 group-focus-visible/seek:opacity-100",
                  (!hoverable || scrubbing) && "scale-100 opacity-100"
                )}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white outline-none transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300/80 active:scale-[0.97]"
          >
            {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          <button
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              el.muted = !el.muted;
              setMuted(el.muted);
            }}
            aria-label={muted ? "Unmute" : "Mute"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white outline-none transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300/80 active:scale-[0.97]"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <span className="text-[12px] font-medium tabular-nums text-white">
            {fmt(at)} / {effectiveDur ? fmt(effectiveDur) : "--:--"}
          </span>
          <button
            onClick={fullscreen}
            aria-label="Fullscreen"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-white outline-none transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300/80 active:scale-[0.97]"
          >
            <Maximize size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
