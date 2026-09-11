import { NextResponse } from "next/server";
import { updateDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string; msgId: string }> };

async function ownMessage(
  convoId: string,
  msgId: string,
  me: string,
  mutate: (m: {
    senderId: string;
    body: string;
    edited: boolean;
    deleted: boolean;
  }) => void
) {
  return updateDB((db) => {
    const convo = db.conversations.find((c) => c.id === convoId);
    if (!convo || (convo.aId !== me && convo.bId !== me)) return null;
    const m = db.messages.find(
      (x) => x.id === msgId && x.convoId === convoId
    );
    if (!m || m.senderId !== me || m.deleted) return null;
    mutate(m);
    return { ...m, mine: true };
  });
}

// PATCH -> edit own message. Peer sees `edited: true`.
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, msgId } = await params;
  const { body } = (await req.json().catch(() => ({}))) as {
    body?: string;
  };
  const text = clean(body, 500);
  if (!text) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const lim = rateLimit(`msgedit:${session.sub}`, 10, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const msg = await ownMessage(id, msgId, session.sub, (m) => {
    m.body = text;
    m.edited = true;
  });
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ message: msg });
}

// DELETE -> tombstone. Peer sees "message deleted" instead of content.
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, msgId } = await params;
  const msg = await ownMessage(id, msgId, session.sub, (m) => {
    m.deleted = true;
  });
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ message: msg });
}
