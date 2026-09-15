import { readDB, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { NotificationItem } from "@/components/notification-item";
import { ClearButton } from "@/components/clear-button";

export const dynamic = "force-dynamic";

export default async function Notifications() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = await readDB();
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const items = db.notifications
    .filter((n) => n.userId === session.sub)
    .slice(0, 30)
    .map((n) => {
      const from = byId.get(n.fromId);
      return {
        ...n,
        fromId: n.fromId,
        from: from
          ? {
              id: from.id,
              name: userPublic(from).name,
              login42: from.login42,
              avatar: from.avatar,
            }
          : null,
      };
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-bold tracking-tight">Notifications</h1>
        {items.length > 0 && <ClearButton />}
      </div>
      {items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-[14px] text-zinc-500 dark:border-zinc-700">
          Nothing yet. Post something and peers will react.
        </p>
      )}
      {items.map((n) => (
        <NotificationItem key={n.id} n={n} />
      ))}
    </div>
  );
}
