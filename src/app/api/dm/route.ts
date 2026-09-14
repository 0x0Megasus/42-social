import { NextResponse } from "next/server";
import { readDB, updateDB, uid, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";

function otherOf(c: { aId: string; bId: string }, me: string): string {
  return c.aId === me ? c.bId : c.aId;
}

// GET /api/dm -> my conversations (peer, last message, unread)
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await readDB();
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const mine = db.conversations.filter(
    (c) => c.aId === session.sub || c.bId === session.sub
  );
  const items = mine
    .map((c) => {
      const peerId = otherOf(c, session.sub);
      const peer = byId.get(peerId);
      // Deleted messages are tombstones: skip them for the preview and
      // unread count so "delete" really makes them disappear in the list.
      const msgs = db.messages
        .filter((m) => m.convoId === c.id && !m.deleted)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = msgs[msgs.length - 1] ?? null;
      const unread = msgs.filter(
        (m) => m.senderId !== session.sub && !m.read
      ).length;
      return {
        id: c.id,
        peer: peer ? userPublic(peer) : null,
        last: last
          ? {
              body: last.body,
              kind: last.kind,
              mine: last.senderId === session.sub,
              createdAt: last.createdAt,
            }
          : null,
        unread,
      };
    })
    .sort((a, b) =>
      (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? "")
    );
  return NextResponse.json({
    conversations: items,
    unread: items.reduce((n, c) => n + c.unread, 0),
  });
}

// POST /api/dm { userId } -> get-or-create 1:1 conversation
export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { userId } = (await req.json().catch(() => ({}))) as {
    userId?: string;
  };
  if (!userId || userId === session.sub)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const convoId = await updateDB((db) => {
    if (!db.users.some((u) => u.id === userId)) return null;
    const [x, y] = [session.sub, userId].sort();
    const existing = db.conversations.find((c) => c.aId === x && c.bId === y);
    if (existing) return existing.id;
    const convo = {
      id: uid("dm"),
      aId: x,
      bId: y,
      createdAt: new Date().toISOString(),
    };
    db.conversations.push(convo);
    return convo.id;
  });
  if (!convoId) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id: convoId });
}
