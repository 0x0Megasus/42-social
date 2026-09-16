import { NextResponse } from "next/server";
import {
  cachedUserById,
  queryCollection,
  readCollection,
  readPath,
  transactLeaf,
  userPublic,
} from "@/lib/db";
import { getSession } from "@/lib/session";

function otherOf(c: { aId: string; bId: string }, me: string): string {
  return c.aId === me ? c.bId : c.aId;
}

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [asA, asB] = await Promise.all([
    queryCollection("conversations", {
      orderBy: "aId",
      equalTo: session.sub,
      limit: 500,
    }).catch(() => []),
    queryCollection("conversations", {
      orderBy: "bId",
      equalTo: session.sub,
      limit: 500,
    }).catch(() => []),
  ]);
  const seen = new Map(asA.map((c) => [c.id, c]));
  for (const c of asB) seen.set(c.id, c);
  const mine = [...seen.values()];
  const items = await Promise.all(
    mine.map(async (c) => {
      const peerId = otherOf(c, session.sub);
      const [peer, msgs] = await Promise.all([
        cachedUserById(peerId).catch(() => null),
        queryCollection("messages", {
          orderBy: "convoId",
          equalTo: c.id,
          limit: 100,
        }).catch(() => []),
      ]);
      const live = msgs
        .filter((m) => !m.deleted)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = live[live.length - 1] ?? null;
      const unread = live.filter(
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
              duration:
                last.kind === "voice" ? (last.attachment?.duration ?? null) : null,
            }
          : null,
        unread,
      };
    })
  );
  items.sort((a, b) =>
    (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? "")
  );
  return NextResponse.json(
    {
      conversations: items,
      unread: items.reduce((n, c) => n + c.unread, 0),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=3, stale-while-revalidate=10",
      },
    }
  );
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { userId } = (await req.json().catch(() => ({}))) as {
    userId?: string;
  };
  if (!userId || userId === session.sub)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const peer = await cachedUserById(userId).catch(() => null);
  if (!peer) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [x, y] = [session.sub, userId].sort();
  const key = `dm_${x}_${y}`;
  const existing = await readPath<{ id: string }>(
    `/conversations/${key}`
  ).catch(() => null);
  if (existing) return NextResponse.json({ id: key });
  const convos = await readCollection("conversations");
  const legacy = convos.find((c) => c.aId === x && c.bId === y);
  if (legacy) return NextResponse.json({ id: legacy.id });
  await transactLeaf(`/conversations/${key}`, (cur) => {
    if (cur && typeof cur === "object") return undefined; // racer won
    return {
      id: key,
      aId: x,
      bId: y,
      createdAt: new Date().toISOString(),
    };
  }).catch(() => null);
  return NextResponse.json({ id: key });
}
