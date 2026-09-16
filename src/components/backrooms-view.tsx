"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Maximize, MonitorX } from "lucide-react";
import { Game } from "@/backrooms/game";
import type { RunResult } from "@/lib/games/types";
import { cn } from "@/lib/utils";

export type BackroomsBoardPayload = {
  seed: number;
  submitted: boolean;
  oppSubmitted: boolean;
  myScore: RunResult | null;
  results: Record<string, RunResult> | null;
};

export function BackroomsView({
  payload,
  onSubmit,
}: {
  payload: BackroomsBoardPayload;
  onSubmit: (result: RunResult) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<number | null>(0);
  const [failed, setFailed] = useState(false);
  const [coarse] = useState(
    () => window.matchMedia("(pointer: coarse)").matches
  );
  const [isFull, setIsFull] = useState(false);

  const submitRef = useRef(onSubmit);
  const submittedRef = useRef(payload.submitted);
  useEffect(() => {
    submitRef.current = onSubmit;
    submittedRef.current = payload.submitted;
  });

  useEffect(() => {
    if (coarse) return;
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let game: Game | null = null;
    (async () => {
      try {
        game = new Game(host, {
          seed: payload.seed,
          onEnd: (r) => {
            if (submittedRef.current) return;
            submitRef.current({
              score: r.score,
              kills: r.kills,
              wave: r.wave,
              time: r.timeSurvived,
              won: r.won,
            });
          },
        });
        await game.loadAssets((done, total) => {
          if (!dead) setProgress(done / Math.max(1, total));
        });
        if (!dead) setProgress(null);
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => {
      dead = true;
      try {
        game?.dispose();
      } catch {
      }
    };
  }, [coarse, payload.seed]);

  useEffect(() => {
    const onFs = () =>
      setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function toggleFullscreen() {
    const host = hostRef.current;
    if (!host) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => null);
    } else {
      void host.requestFullscreen?.().catch(() => null);
    }
  }

  if (coarse) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl bg-black text-center ring-1 ring-white/10">
        <MonitorX size={28} className="text-amber-300/80" />
        <p className="text-[15px] font-bold text-stone-200">
          Desktop required
        </p>
        <p className="max-w-[26rem] px-6 text-[13px] text-stone-400">
          The Backrooms needs a keyboard, mouse, and pointer lock. Open this
          room on a desktop to play.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={hostRef}
        aria-label="Backrooms game"
        className="relative aspect-video w-full touch-none overflow-hidden rounded-2xl bg-black shadow-[0_18px_50px_-12px_rgba(0,0,0,0.75)] ring-1 ring-black/60"
      >
        {(progress !== null || failed) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#050403]">
            {failed ? (
              <>
                <p className="text-[14px] font-bold text-red-300">
                  Failed to boot the Backrooms.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-full bg-zinc-100 px-5 py-2 text-[13px] font-semibold text-zinc-900"
                >
                  Reload
                </button>
              </>
            ) : (
              <>
                <LoaderCircle size={22} className="animate-spin text-amber-200/80" />
                <p className="text-[12px] tracking-[0.3em] text-amber-100/70">
                  NO-CLIPPING…
                </p>
                <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-amber-200/80 transition-[width]"
                    style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                  />
                </div>
              </>
            )}
          </div>
        )}
        {payload.submitted && progress === null && !failed && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold tracking-widest text-emerald-300 ring-1 ring-emerald-300/30 backdrop-blur">
            SCORE TRANSMITTED
          </div>
        )}
      </div>
      <div className="flex items-center justify-end">
        <button
          onClick={toggleFullscreen}
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-4 py-1.5",
            "text-[12px] font-semibold text-stone-300 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
          )}
        >
          <Maximize size={13} />
          {isFull ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>
    </div>
  );
}
