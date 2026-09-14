// Shared loading skeletons (skills: tailwind-design-system, anti-ui-slop,
// wcag-audit-patterns, vercel-react-best-practices rendering-*).
//
// Rules:
// - Exactly ONE chat skeleton (ChatSkeleton) for every conversational surface:
//   post comments, DM thread, DM page loader. No duplicated pulse arrays.
// - Every route loader mirrors its real layout row-for-row so content never
//   jumps when data arrives (same padding, gaps, radii, avatar sizes).
// - All pulses use `motion-safe:animate-pulse` + static zinc fills so
//   `prefers-reduced-motion` shows a calm placeholder instead of flashing.
// - Wrappers carry `role="status"` + `aria-label`; inner shapes are
//   `aria-hidden` so screen readers hear one "Loading …" announcement.

import { cn } from "@/lib/utils";

function Pulse({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800",
        className
      )}
    />
  );
}

function Status({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-label={label} className={className}>
      {children}
    </div>
  );
}

// THE one chat skeleton — avatar 32 + name/time + bubble lines.
// Matches the comment row (`flex gap-2.5 p-3`) and the DM row
// (`flex gap-3 px-4 pt-2`) via the `density` prop, not a second component.
export function ChatSkeleton({
  rows = 3,
  label = "Loading messages",
  density = "comment",
}: {
  rows?: number;
  label?: string;
  density?: "comment" | "dm";
}) {
  const widths = ["w-11/12", "w-2/3", "w-4/5", "w-1/2"];
  return (
    <Status label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className={cn(
            "flex gap-2",
            density === "comment" ? "px-3 py-2" : "px-4 pb-0.5 pt-2"
          )}
        >
          <Pulse
            className={cn(
              "shrink-0 rounded-full",
              density === "comment" ? "h-8 w-8" : "h-10 w-10"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Pulse className="h-3 w-20 rounded" />
              <Pulse className="h-2.5 w-12 rounded opacity-70" />
            </div>
            <Pulse
              className={cn(
                "mt-2 h-9 rounded-2xl rounded-tl-md",
                widths[i % widths.length]
              )}
            />
          </div>
        </div>
      ))}
    </Status>
  );
}

// Post card mirror: header (avatar 40 + 2 lines + menu dot) + body lines +
// action pills. Used by the home feed loader.
export function PostCardSkeleton() {
  return (
    <div
      aria-hidden
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-center gap-3">
        <Pulse className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Pulse className="h-3.5 w-32 rounded-md" />
          <Pulse className="h-3 w-44 rounded-md opacity-70" />
        </div>
        <Pulse className="h-6 w-6 shrink-0 rounded-full" />
      </div>
      <div className="mt-3 space-y-2">
        <Pulse className="h-3.5 w-full rounded" />
        <Pulse className="h-3.5 w-5/6 rounded opacity-70" />
      </div>
      <div className="mt-3 flex items-center gap-1">
        <Pulse className="h-7 w-16 rounded-full" />
        <Pulse className="h-7 w-16 rounded-full" />
      </div>
    </div>
  );
}

// Inbox row mirror: avatar 40 + name/preview + time/unread column.
// Matches DmList's `flex items-center gap-3 p-3` rows exactly.
export function DmRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <Pulse className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Pulse className="h-3.5 w-28 rounded-md" />
            <Pulse className="h-3 w-3/4 rounded-md opacity-70" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Pulse className="h-2.5 w-8 rounded" />
            {i === 0 && <Pulse className="h-5 w-5 rounded-full" />}
          </div>
        </div>
      ))}
    </>
  );
}

// Person row mirror: avatar 40 + name/handle + two action buttons.
// Matches ExploreClient rows.
export function PersonRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <Pulse className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Pulse className="h-3.5 w-28 rounded-md" />
            <Pulse className="h-3 w-48 rounded-md opacity-70" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Pulse className="h-8 w-16 rounded-full" />
            <Pulse className="h-8 w-8 rounded-full" />
          </div>
        </div>
      ))}
    </>
  );
}

// Notification row mirror: avatar 36 + two text lines + unread dot slot.
export function NotificationRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <Pulse className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Pulse className="h-3.5 w-4/5 rounded-md" />
            <Pulse className="h-3 w-16 rounded-md opacity-70" />
          </div>
          {i === 0 && <Pulse className="h-2 w-2 shrink-0 rounded-full" />}
        </div>
      ))}
    </>
  );
}
