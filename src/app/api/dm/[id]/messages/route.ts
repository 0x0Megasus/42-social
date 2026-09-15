import { NextResponse } from "next/server";
import {
  cachedUserById,
  newPushKey,
  queryCollection,
  queryCollectionEntries,
  readCollection,
  readUserById,
  setPath,
  updatePaths,
  userPublic,
  type QuotedReply,
} from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";
import { isCloudinaryUrl } from "@/lib/cloudinary";

function isParticipant(
  convo: { aId: string; bId: string } | undefined,
  me: string
): convo is { aId: string; bId: string } {
  return !!convo && (convo.aId === me || convo.bId === me);
}

const PAGE = 100;

// GET -> thread page + peer info. Marks the returned peer messages read.
// ?offset=N pages older history (in-memory slice of the indexed convo
// fetch; new arrivals shift offsets — fine for history browsing).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const offset = Math.min(
    Math.max(Number(new URL(req.url).searchParams.get("offset")) || 0, 0),
    900
  );
  const convos = await readCollection("conversations");
  const convo = convos.find((c) => c.id === id);
  if (!isParticipant(convo, session.sub))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const peerId = convo.aId === session.sub ? convo.bId : convo.aId;
  const [peer, entries] = await Promise.all([
    readUserById(peerId),
    queryCollectionEntries("messages", {
      orderBy: "convoId",
      equalTo: id,
      limit: offset + PAGE + 1,
    }).catch(() => []),
  ]);
  // orderBy convoId groups the thread; chronological order in memory.
  const sorted = entries
    .map((e) => ({ ...e }))
    .sort((a, b) => a.row.createdAt.localeCompare(b.row.createdAt));
  const end = Math.max(sorted.length - offset, 0);
  const start = Math.max(end - PAGE, 0);
  const page = sorted.slice(start, end);
  const hasMore = start > 0;
  const readPaths: Record<string, unknown> = {};
  for (const { key, row } of page) {
    if (row.senderId !== session.sub && !row.read)
      readPaths[`/messages/${key}/read`] = true;
  }
  if (Object.keys(readPaths).length > 0) await updatePaths(readPaths);
  return NextResponse.json(
    {
      peer: peer ? userPublic(peer) : null,
      messages: page.map(({ row: m }) => ({
        ...m,
        read: m.senderId !== session.sub ? true : m.read,
        mine: m.senderId === session.sub,
      })),
      hasMore,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=3, stale-while-revalidate=10",
      },
    }
  );
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
    attachment?: {
      url?: string;
      duration?: number;
      peaks?: number[];
      bytes?: number;
      mime?: string;
      publicId?: string;
    } | null;
  };
  const isVoice = payload.kind === "voice";
  const text = clean(payload.body, 500);
  if (!text && !isVoice)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  // Voice attachments are validated field-by-field (URLs must be https,
  // durations/bytes within caps, peaks a small number array).
  let attachment: {
    url: string;
    duration: number | null;
    peaks: number[] | null;
    bytes: number | null;
    mime: string | null;
    publicId: string | null;
  } | null = null;
  if (isVoice) {
    const a = payload.attachment;
    const cleanUrl =
      a && typeof a.url === "string" && isCloudinaryUrl(a.url) && a.url.length <= 2000
        ? a.url
        : null;
    if (!cleanUrl)
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const duration = num(a?.duration);
    const bytes = num(a?.bytes);
    if (
      (duration !== null && (duration < 0 || duration > 185)) ||
      (bytes !== null && (bytes < 0 || bytes > 8 * 1024 * 1024))
    )
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    const peaks =
      a?.peaks && Array.isArray(a.peaks) && a.peaks.length <= 64
        ? a.peaks.map((p) => (typeof p === "number" ? Math.min(1, Math.max(0, p)) : 0))
        : null;
    const mime =
      a?.mime && typeof a.mime === "string" && a.mime.startsWith("audio/")
        ? a.mime.slice(0, 60)
        : null;
    attachment = {
      url: cleanUrl,
      duration,
      peaks,
      bytes,
      mime,
      publicId:
        a?.publicId && typeof a.publicId === "string"
          ? a.publicId.slice(0, 200)
          : null,
    };
  }
  const lim = rateLimit(`dm:${session.sub}`, 30, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter) } }
    );
  const convos = await readCollection("conversations");
  const convo = convos.find((c) => c.id === id);
  if (!isParticipant(convo, session.sub))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  let replyTo: QuotedReply = null;
  if (payload.replyToId) {
    const targets = await queryCollection("messages", {
      orderBy: "convoId",
      equalTo: id,
      limit: 100_000,
    }).catch(() => []);
    const target = targets.find(
      (x) => x.id === payload.replyToId && !x.deleted
    );
    if (target) {
      const sender = await cachedUserById(target.senderId).catch(() => null);
      replyTo = {
        id: target.id,
        body:
          target.kind === "sticker" ? "Sticker" : clean(target.body, 120),
        name: sender ? sender.name : "Unknown",
        senderId: target.senderId,
      };
    }
  }
  const now = new Date().toISOString();
  const m = {
    id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    convoId: id,
    senderId: session.sub,
    body: text || "Voice message",
    kind: (isVoice ? "voice" : payload.kind === "sticker" ? "sticker" : "text") as
      | "text"
      | "sticker"
      | "voice",
    read: false,
    edited: false,
    deleted: false,
    replyTo,
    createdAt: now,
    attachment,
  };
  // Push-key write: conflict-free, O(1), no transaction.
  await setPath(`/messages/${newPushKey("messages")}`, m);
  return NextResponse.json({ message: { ...m, mine: true } }, { status: 201 });
}
