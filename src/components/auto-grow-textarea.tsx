"use client";

import { forwardRef, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  // Grows with content up to this px, then scrolls internally.
  maxHeight?: number;
};

// Chat-style input: a single line at rest, grows while typing so long
// messages stay readable. Enter-to-send vs newline is the caller's call
// (pass onKeyDown) — this only owns the height.
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function AutoGrowTextarea(
    { maxHeight = 132, className, value, ...rest },
    ref
  ) {
    const inner = useRef<HTMLTextAreaElement | null>(null);

    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      // Border-box math: scrollHeight covers content + padding only, so add
      // the border back — otherwise the field lands ~2px off the h-9 row.
      const border = el.offsetHeight - el.clientHeight;
      el.style.height = "auto";
      const full = el.scrollHeight + border;
      const next = Math.min(Math.max(full, 36), maxHeight);
      el.style.height = `${next}px`;
      el.style.overflowY = full > maxHeight ? "auto" : "hidden";
    }, [value, maxHeight]);

    return (
      <textarea
        {...rest}
        value={value}
        rows={1}
        ref={(el) => {
          inner.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        // block (not inline-block): kills the baseline strut gap that would
        // otherwise lift the field a few px above its row-mates.
        className={cn("block resize-none overflow-y-auto", className)}
      />
    );
  }
);
