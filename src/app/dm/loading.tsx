import { DmRowSkeleton } from "@/components/skeletons";

// Mirrors DmList: title → conversation rows → "New chat" section.
export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading messages">
      <div
        aria-hidden
        className="h-7 w-28 rounded-md bg-zinc-200 px-1 motion-safe:animate-pulse dark:bg-zinc-800"
      />
      <DmRowSkeleton count={3} />
      <div aria-hidden className="pt-2">
        <div className="h-4 w-20 rounded bg-zinc-200 px-1 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="mt-2 space-y-2">
          <DmRowSkeleton count={2} />
        </div>
      </div>
    </div>
  );
}
