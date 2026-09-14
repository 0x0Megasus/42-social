"use client";

import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Founder seal — blue verified check, icon only. Marks the site owner so
// users know who they're talking to. Shown next to names on posts,
// comments, explore rows, and the profile header.
export function FounderBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Founder — official site owner & support"
      className={cn("inline-flex shrink-0 items-center", className)}
    >
      <BadgeCheck
        size={16}
        aria-hidden
        className="fill-sky-500 text-white dark:fill-sky-400"
      />
    </span>
  );
}
