import { PersonRowSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading students">
      <div
        aria-hidden
        className="h-7 w-40 rounded-md bg-zinc-200 px-1 motion-safe:animate-pulse dark:bg-zinc-800"
      />
      <div
        aria-hidden
        className="h-11 w-full rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      />
      <PersonRowSkeleton count={5} />
    </div>
  );
}
