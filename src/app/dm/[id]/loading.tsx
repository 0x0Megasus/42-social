import { ChatSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="relative left-1/2 flex h-[calc(100dvh-10rem)] min-h-[20rem] w-[min(56rem,calc(100vw-2rem))] max-w-none -translate-x-1/2 flex-col overflow-hidden">
      <div
        aria-hidden
        className="flex shrink-0 items-center gap-2 px-1 pb-3"
      >
        <div className="h-9 w-9 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="h-9 w-9 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="min-w-0 space-y-1.5">
          <div className="h-4 w-28 rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="h-3 w-20 rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="min-h-0 flex-1 overflow-hidden pt-5">
          <ChatSkeleton rows={4} label="Loading conversation" density="dm" />
        </div>
        <div
          aria-hidden
          className="flex shrink-0 items-center gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="h-10 min-w-0 flex-1 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="h-10 w-16 shrink-0 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
