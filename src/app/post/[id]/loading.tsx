import { PostCardSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading post">
      <div
        aria-hidden
        className="h-5 w-28 rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800"
      />
      <PostCardSkeleton />
    </div>
  );
}
