"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { isMuted, setMuted, playBlip, unlockAudio } from "@/lib/sound";

export function SoundSetting() {
  const [muted, setMutedState] = useState(true);

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) {
      unlockAudio();
      playBlip();
    }
  }

  return (
    <div className="mx-auto mt-3 flex max-w-xs items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </span>
      <span className="flex-1 text-left">
        <span className="block text-[14px] font-semibold">Sounds</span>
        <span className="block text-xs text-zinc-500">
          {muted ? "Off" : "Chimes for alerts & messages"}
        </span>
      </span>
      <button
        role="switch"
        aria-checked={!muted}
        aria-label="Toggle sounds"
        onClick={toggle}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          muted ? "bg-zinc-300 dark:bg-zinc-700" : "bg-cyan-500"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            muted ? "left-0.5" : "left-[22px]"
          )}
        />
      </button>
    </div>
  );
}
