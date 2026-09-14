"use client";

import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Founder seal — blue verified check + label, marks the site owner so
// users know who they're talking to. Shown next to names on posts,
// comments, explore rows, and the profile header.
export function FounderBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Founder — official site owner & support"
      className={cn("inline-flex shrink-0 items-center gap-1", className)}
    >
      <BadgeCheck
        size={15}
        aria-hidden
        className="fill-sky-500 text-white dark:fill-sky-400"
      />
      <span className="text-[11px] font-bold tracking-wide text-sky-600 dark:text-sky-400">
        Founder
      </span>
    </span>
  );
}
