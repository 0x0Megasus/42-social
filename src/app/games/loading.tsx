export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading arcade">
      <div aria-hidden className="flex items-center gap-2 px-1">
        <div className="h-5 w-5 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="h-5 w-20 rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
      </div>
      <div aria-hidden className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="h-8 w-8 rounded-lg bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="mt-2 h-4 w-28 rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="mt-1.5 h-3 w-4/5 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="mt-3 h-10 w-full rounded-xl bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="h-10 min-w-0 flex-1 rounded-xl bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="h-10 w-20 shrink-0 rounded-xl bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
      </div>
    </div>
  );
}
