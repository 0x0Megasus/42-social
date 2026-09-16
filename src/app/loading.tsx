import { PostCardSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading feed">
      <div
        aria-hidden
        className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="h-[76px] rounded-xl bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="mt-2 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <div className="h-8 w-8 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="h-8 w-8 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="h-4 w-12 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
          </div>
          <div className="h-8 w-16 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        </div>
      </div>
      <div aria-hidden className="flex items-center gap-1 px-1">
        <div className="h-6 w-12 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="h-6 w-12 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
      </div>
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </div>
  );
}
