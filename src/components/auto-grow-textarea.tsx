"use client";

import { forwardRef, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  maxHeight?: number;
};

export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function AutoGrowTextarea(
    { maxHeight = 132, className, value, ...rest },
    ref
  ) {
    const inner = useRef<HTMLTextAreaElement | null>(null);

    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
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
        className={cn("block resize-none overflow-y-auto", className)}
      />
    );
  }
);
