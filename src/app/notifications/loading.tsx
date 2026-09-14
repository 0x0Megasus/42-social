import { NotificationRowSkeleton } from "@/components/skeletons";

// Mirrors Notifications: header row (title + clear slot) → notification rows.
export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading notifications">
      <div aria-hidden className="flex items-center justify-between px-1">
        <div className="h-6 w-32 rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="h-6 w-14 rounded-full bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
      </div>
      <NotificationRowSkeleton count={5} />
    </div>
  );
}
