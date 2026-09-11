"use client";

import { cn } from "@/lib/utils";
import { stripMarkup } from "@/components/rich-text";

// Discord-style reply quote: blurple accent bar + tinted wash.
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
      <span className="block truncate text-[11px] font-bold text-[#5865F2]">
        {mine ? `${name} (you)` : name}
      </span>
      <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">
        {stripMarkup(body)}
      </span>
    </>
  );
  if (!onJump) {
    return (
      <span className="mb-1 block rounded border-l-2 border-[#5865F2] bg-[#5865F2]/10 px-2 py-1">
        {inner}
      </span>
    );
  }
  return (
    <button
      onClick={onJump}
      title="Jump to original"
      className={cn(
        "mb-1 block w-full rounded border-l-2 border-[#5865F2]",
        "bg-[#5865F2]/10 px-2 py-1 text-left",
        "transition-colors hover:bg-[#5865F2]/20"
      )}
    >
      {inner}
    </button>
  );
}
