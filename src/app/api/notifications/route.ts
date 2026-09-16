import { NextResponse } from "next/server";
import { cachedUserById, userPublic } from "@/lib/db";
import {
  deleteNotifications,
  listNotifications,
  markAllRead,
} from "@/lib/notifications";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await listNotifications(session.sub, 30);
  const fromIds = [...new Set(items.map((n) => n.fromId))];
  const users = await Promise.all(fromIds.map((id) => cachedUserById(id)));
  const byId = new Map(users.filter((u) => !!u).map((u) => [u!.id, u!]));
  return NextResponse.json(
    {
      notifications: items.map((n) => ({
        ...n,
        from: byId.get(n.fromId) ? userPublic(byId.get(n.fromId)!) : null,
      })),
      unread: items.filter((n) => !n.read).length,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=5, stale-while-revalidate=15",
      },
    }
  );
}

export async function POST() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await markAllRead(session.sub);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? null;
  const removed = await deleteNotifications(session.sub, id);
  return NextResponse.json({ removed });
}
