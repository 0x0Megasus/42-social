export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading conversation">
      <div className="flex items-center gap-2 px-1">
        <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="space-y-1.5">
          <div className="h-4 w-28 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-20 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
      <div
        aria-hidden
        className="flex h-[calc(100dvh-10rem)] min-h-[20rem] flex-col justify-end gap-2 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800"
      >
        <div className="h-10 w-2/3 animate-pulse self-start rounded-2xl rounded-bl-md bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 w-1/2 animate-pulse self-end rounded-2xl rounded-br-md bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-14 w-3/5 animate-pulse self-start rounded-2xl rounded-bl-md bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
