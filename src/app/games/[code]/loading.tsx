export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading game">
      <div
        aria-hidden
        className="h-36 rounded-2xl border border-zinc-200 motion-safe:animate-pulse dark:border-zinc-800"
      />
      <div
        aria-hidden
        className="mx-auto aspect-square w-full max-w-sm rounded-2xl bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800"
      />
    </div>
  );
}
