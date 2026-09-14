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
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
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
        className={cn("resize-none overflow-y-auto", className)}
      />
    );
  }
);
