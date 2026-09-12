"use client";

import { Bold, Italic, Code } from "lucide-react";
import { takeGraphemes } from "@/lib/sanitize";

// Wraps the current selection (or cursor) with a markdown marker.
// Works on controlled inputs: caller owns value + setter via props below.
export function wrapSelection(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  set: (v: string) => void,
  max: number,
  marker: string
): void {
  const s = el?.selectionStart ?? value.length;
  const e = el?.selectionEnd ?? value.length;
  const before = value.slice(0, s);
  const sel = value.slice(s, e);
  const after = value.slice(e);
  // grapheme-safe: never split surrogate pairs or ZWJ emoji in half
  const next = takeGraphemes(
    sel ? `${before}${marker}${sel}${marker}${after}` : `${before}${marker}${marker}${after}`,
    max
  );
  set(next);
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    const pos = sel
      ? s + marker.length + Array.from(sel).length + marker.length
      : s + marker.length;
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* hidden input */
    }
  });
}

const BUTTONS = [
  { marker: "**", label: "Bold", title: "Bold (**text**)", Icon: Bold },
  { marker: "*", label: "Italic", title: "Italic (*text*)", Icon: Italic },
  { marker: "`", label: "Code", title: "Code (`text`)", Icon: Code },
] as const;

export function FormatBar({
  targetRef,
  value,
  onChange,
  max,
}: {
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <span className="flex items-center" role="toolbar" aria-label="Text formatting">
      {BUTTONS.map(({ marker, label, title, Icon }) => (
        <button
          key={marker}
          type="button"
          title={title}
          aria-label={label}
          onClick={() => wrapSelection(targetRef.current, value, onChange, max, marker)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <Icon size={15} />
        </button>
      ))}
    </span>
  );
}
