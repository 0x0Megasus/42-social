export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading messages">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden
          className="h-16 animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        />
      ))}
    </div>
  );
}
