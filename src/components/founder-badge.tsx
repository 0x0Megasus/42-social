"use client";

import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Founder seal — blue verified check, icon only. Hover shows who it is.
// Marks the site owner so users know who they're talking to. Shown next
// to names on posts, comments, explore rows, and the profile header.
export function FounderBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Founder and support — runs this platform"
      className={cn("relative inline-flex shrink-0 items-center", className)}
    >
      <BadgeCheck
        size={16}
        aria-hidden
        className="peer fill-sky-500 text-white dark:fill-sky-400"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden w-max max-w-[12rem] -translate-x-1/2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-center shadow-xl peer-hover:block"
      >
        <span className="block text-[11px] font-bold text-white">
          Founder &amp; Support
        </span>
        <span className="block text-[11px] text-zinc-400">
          Official account — runs this platform
        </span>
      </span>
    </span>
  );
}
