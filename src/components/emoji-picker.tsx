"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";

// Zero-dep picker: 24 essentials, no scroll — fits any screen.
const EMOJIS = [
  "😂", "❤️", "🔥", "💯", "😭", "😅", "👀", "👏",
  "🙌", "💀", "😎", "🤝", "👍", "🎉", "🚀", "💡",
  "🤔", "🥳", "💪", "🧠", "☕", "🎮", "⭐", "🏆",
];

export function EmojiPicker({ onEmoji }: { onEmoji: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Add emoji"
        aria-expanded={open}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <Smile size={19} />
      </button>
      {open && (
        <div className="absolute bottom-11 left-0 z-50 w-52 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div
            role="grid"
            aria-label="Emojis"
            className="grid grid-cols-8 gap-0"
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onEmoji(e)}
                aria-label={`Insert ${e}`}
                className="cursor-pointer rounded-lg p-1 text-lg leading-none hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Kick-style username color: stable hash -> hue.
export function kickColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 80% 55%)`;
}
