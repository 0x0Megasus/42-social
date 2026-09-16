import { NextResponse } from "next/server";
import {
  newPushKey,
  queryCollection,
  readPostById,
  readUserById,
  setPath,
  type QuotedReply,
} from "@/lib/db";
import { isSupportUser } from "@/lib/support";
import { newNotification, pushNotification } from "@/lib/notifications";
import { recountPost } from "@/lib/counters";
import { getSession } from "@/lib/session";
import { rateLimit, isDuplicate } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";
import { enrichComments } from "@/lib/feed";

const PER_MIN = 6;
const GAP_MS = 3_000;
const PAGE = 200;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const postId = q.get("postId") ?? "";
  if (!postId) return NextResponse.json({ comments: [], nextOffset: null });
  const limit = Math.min(Math.max(Number(q.get("limit")) || PAGE, 1), 500);
  const offset = Math.max(Number(q.get("offset")) || 0, 0);
  const rows = await queryCollection("comments", {
    orderBy: "postId",
    equalTo: postId,
    limit: 100_000,
  }).catch(() => []);
  const live = rows
    .filter((c) => !c.deleted)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const end = Math.max(live.length - offset, 0);
  const start = Math.max(end - limit, 0);
  const page = await enrichComments(live.slice(start, end));
  return NextResponse.json(
    {
      comments: page,
      nextOffset: start > 0 ? offset + page.length : null,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    }
  );
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sub = session.sub;
  const { postId, body, kind, replyToId } = (await req.json().catch(
    () => ({})
  )) as {
    postId?: string;
    body?: string;
    kind?: string;
    replyToId?: string;
  };
  const text = clean(body, 300);
  if (!postId || !text)
    return NextResponse.json({ error: "invalid" }, { status: 400 });

  const gap = rateLimit(`comment-gap:${sub}`, 1, GAP_MS);
  if (!gap.ok)
    return NextResponse.json(
      { error: "slow", retryAfter: gap.retryAfter },
      { status: 429, headers: { "Retry-After": String(gap.retryAfter) } }
    );
  const vol = rateLimit(`comment-vol:${sub}`, PER_MIN, 60_000);
  if (!vol.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: vol.retryAfter },
      { status: 429, headers: { "Retry-After": String(vol.retryAfter) } }
    );
  if (isDuplicate(`comment-dupe:${sub}`, `${postId}:${text}`, 60_000))
    return NextResponse.json({ error: "duplicate" }, { status: 429 });

  const post = await readPostById(postId);
  if (!post || post.deleted)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  let replyTo: QuotedReply = null;
  if (replyToId) {
    const targets = await queryCollection("comments", {
      orderBy: "postId",
      equalTo: postId,
      limit: 100_000,
    }).catch(() => []);
    const target = targets.find(
      (x) => x.id === replyToId && !x.deleted
    );
    if (target) {
      replyTo = {
        id: target.id,
        body:
          target.kind === "sticker" ? "Sticker" : clean(target.body, 120),
        name: target.author?.name ?? "Unknown",
        senderId: target.authorId,
      };
    }
  }
  const me = await readUserById(sub);
  const now = new Date().toISOString();
  const c = {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    postId,
    authorId: sub,
    body: text,
    kind: (kind === "sticker" ? "sticker" : "text") as "text" | "sticker",
    edited: false,
    deleted: false,
    replyTo,
    createdAt: now,
    author: me
      ? {
          id: me.id,
          name: me.name,
          login42: me.login42 ?? null,
          avatar: me.avatar ?? null,
          campus: me.campus ?? null,
          isSupport: isSupportUser(me),
        }
      : null,
  };
  const key = newPushKey("comments");
  await setPath(`/comments/${key}`, c);
  if (post.authorId !== sub) {
    await pushNotification(
      newNotification(post.authorId, "comment", sub, postId)
    ).catch(() => null);
  }
  const counts = await recountPost(postId).catch(() => null);
  return NextResponse.json(
    { comment: c, total: counts?.comments ?? 0 },
    { status: 201 }
  );
}
