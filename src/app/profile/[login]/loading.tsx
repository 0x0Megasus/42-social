import { PostCardSkeleton } from "@/components/skeletons";

// Mirrors Profile: header card (avatar 72 + name + handle + stats + actions)
// → game record strip → posts.
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading profile">
      <div
        aria-hidden
        className="rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex justify-center">
          <div className="h-[72px] w-[72px] rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        </div>
        <div className="mx-auto mt-3 h-6 w-40 rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="mx-auto mt-2 h-4 w-52 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="mt-2 flex items-center justify-center gap-4">
          <div className="h-4 w-20 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="h-4 w-36 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <div className="h-9 w-24 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="h-9 w-9 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        </div>
      </div>
      <PostCardSkeleton />
      <PostCardSkeleton />
    </div>
  );
}
