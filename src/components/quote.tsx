"use client";

import { cn } from "@/lib/utils";
import { stripMarkup } from "@/components/rich-text";

export function Quote({
  name,
  body,
  onJump,
  mine,
}: {
  name: string;
  body: string;
  onJump?: () => void;
  mine?: boolean;
}) {
  const inner = (
    <>
      <span className="block truncate text-[11px] font-bold text-cyan-700 dark:text-cyan-300">
        {mine ? `${name} (you)` : name}
      </span>
      <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">
        {stripMarkup(body)}
      </span>
    </>
  );
  if (!onJump) {
    return (
      <span className="mb-1 block rounded border-l-2 border-cyan-500 bg-cyan-500/10 px-2 py-1">
        {inner}
      </span>
    );
  }
  return (
    <button
      onClick={onJump}
      title="Jump to original"
      className={cn(
        "mb-1 block w-full rounded border-l-2 border-cyan-500",
        "bg-cyan-500/10 px-2 py-1 text-left",
        "transition-colors hover:bg-cyan-500/20"
      )}
    >
      {inner}
    </button>
  );
}
