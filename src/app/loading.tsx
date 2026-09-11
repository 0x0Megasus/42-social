function Block({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    />
  );
}

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading feed">
      <Block className="h-28" />
      <Block className="h-36" />
      <Block className="h-36" />
      <Block className="h-36" />
    </div>
  );
}
