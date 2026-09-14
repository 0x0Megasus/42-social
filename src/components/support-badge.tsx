"use client";

import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Official support badge — marks the site owner/support so users know
// who they're talking to. Shown next to names on posts, comments,
// explore rows, and the profile header.
export function SupportBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Official support"
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-cyan-500/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300",
        className
      )}
    >
      <ShieldCheck size={11} aria-hidden />
      Support
    </span>
  );
}
