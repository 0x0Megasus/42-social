import { NextResponse } from "next/server";
import { readDB, updateDB, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await readDB();
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const items = db.notifications
    .filter((n) => n.userId === session.sub)
    .slice(0, 30)
    .map((n) => ({
      ...n,
      from: byId.get(n.fromId) ? userPublic(byId.get(n.fromId)!) : null,
    }));
  return NextResponse.json({
    notifications: items,
    unread: items.filter((n) => !n.read).length,
  });
}

export async function POST() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await updateDB((d) => {
    for (const n of d.notifications)
      if (n.userId === session.sub) n.read = true;
  });
  return NextResponse.json({ ok: true });
}
