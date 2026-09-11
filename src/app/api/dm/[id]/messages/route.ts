import { NextResponse } from "next/server";
import { updateDB, uid, userPublic, type QuotedReply } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

function isParticipant(
  convo: { aId: string; bId: string } | undefined,
  me: string
): convo is { aId: string; bId: string } {
  return !!convo && (convo.aId === me || convo.bId === me);
}

// GET -> thread (marks peer messages read) + peer info
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await updateDB((db) => {
    const convo = db.conversations.find((c) => c.id === id);
    if (!isParticipant(convo, session.sub)) return null;
    const peerId = convo.aId === session.sub ? convo.bId : convo.aId;
    const peer = db.users.find((u) => u.id === peerId);
    for (const m of db.messages) {
      if (m.convoId === id && m.senderId !== session.sub && !m.read) {
        m.read = true;
      }
    }
    const messages = db.messages
      .filter((m) => m.convoId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-100)
      .map((m) => ({ ...m, mine: m.senderId === session.sub }));
    return { peer: peer ? userPublic(peer) : null, messages };
  });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

// POST -> send message { body, kind }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const payload = (await req.json().catch(() => ({}))) as {
    body?: string;
    kind?: string;
    replyToId?: string;
  };
  const text = clean(payload.body, 500);
  if (!text) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const lim = rateLimit(`dm:${session.sub}`, 30, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter) } }
    );
  const msg = await updateDB((db) => {
    const convo = db.conversations.find((c) => c.id === id);
    if (!isParticipant(convo, session.sub)) return null;
    let replyTo: QuotedReply = null;
    if (payload.replyToId) {
      const target = db.messages.find(
        (x) => x.id === payload.replyToId && x.convoId === id && !x.deleted
      );
      if (target) {
        const sender = db.users.find((u) => u.id === target.senderId);
        replyTo = {
          id: target.id,
          body:
            target.kind === "sticker" ? "Sticker" : clean(target.body, 120),
          name: sender ? sender.name : "Unknown",
          senderId: target.senderId,
        };
      }
    }
    const m = {
      id: uid("m"),
      convoId: id,
      senderId: session.sub,
      body: text,
      kind: (payload.kind === "sticker" ? "sticker" : "text") as
        | "text"
        | "sticker",
      read: false,
      edited: false,
      deleted: false,
      replyTo,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(m);
    return m;
  });
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ message: { ...msg, mine: true } }, { status: 201 });
}
