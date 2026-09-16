"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

export function FounderBadge({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const t = setTimeout(() => window.addEventListener("click", onClose), 0);
    function onClose() {
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", onClose);
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center", className)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-describedby={tipId}
        aria-label="Founder and support — runs this platform"
        className="peer flex shrink-0 cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <svg
          width={17}
          height={17}
          viewBox="0 0 24 24"
          aria-hidden
          className="shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
        >
          <defs>
            <linearGradient id="founder-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f9e08a" />
              <stop offset="45%" stopColor="#e8b62a" />
              <stop offset="100%" stopColor="#9c6b0e" />
            </linearGradient>
          </defs>
          <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="1.5" fill="url(#founder-gold)" />
          <rect
            x="5.2"
            y="5.2"
            width="13.6"
            height="13.6"
            rx="1.5"
            fill="url(#founder-gold)"
            transform="rotate(45 12 12)"
          />
          <circle cx="12" cy="12" r="6.4" fill="#181407" />
          <circle
            cx="12"
            cy="12"
            r="6.4"
            fill="none"
            stroke="#f9e08a"
            strokeOpacity="0.55"
            strokeWidth="0.8"
          />
          <path
            d="M8.8 12.3l2.3 2.3 4.2-4.8"
            fill="none"
            stroke="#f5c93c"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span
        role="tooltip"
        id={tipId}
        className={cn(
          "pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-max max-w-[12rem] -translate-x-1/2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-center shadow-xl",
          open ? "block" : "hidden peer-hover:block peer-focus-visible:block"
        )}
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
