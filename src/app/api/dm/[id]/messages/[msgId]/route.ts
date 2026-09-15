import { NextResponse } from "next/server";
import {
  queryCollectionEntries,
  readCollection,
  setPath,
  type Message,
} from "@/lib/db";
import { destroyAssets } from "@/lib/cloudinary-admin";
import { publicIdFromUrl } from "@/lib/cloudinary";
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
  const convos = await readCollection("conversations");
  const convo = convos.find((c) => c.id === convoId);
  if (!convo || (convo.aId !== me && convo.bId !== me)) return null;
  // Indexed id lookup + direct write (see comments/[id] for why this is
  // read-verify-write instead of a leaf transaction).
  const hits = await queryCollectionEntries("messages", {
    orderBy: "id",
    equalTo: msgId,
    limit: 5,
  }).catch(() => []);
  const hit = hits.find(
    ({ row }) => row.convoId === convoId && row.senderId === me && !row.deleted
  );
  if (!hit) return null;
  const next: Message = { ...hit.row };
  mutate(next);
  await setPath(`/messages/${hit.key}`, next);
  return { ...next, mine: true };
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
// Attached voice bytes are reclaimed from the bucket (best-effort).
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, msgId } = await params;
  const msg = await ownMessage(id, msgId, session.sub, (m) => {
    m.deleted = true;
  });
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });
  void destroyAssets([
    msg.attachment?.publicId,
    publicIdFromUrl(msg.attachment?.url ?? ""),
  ]);
  return NextResponse.json({ message: msg });
}
