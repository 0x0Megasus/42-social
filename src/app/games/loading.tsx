export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading arcade">
      <div className="h-40 animate-pulse rounded-2xl border border-zinc-200 dark:border-zinc-800" />
      <div className="h-40 animate-pulse rounded-2xl border border-zinc-200 dark:border-zinc-800" />
    </div>
  );
}
