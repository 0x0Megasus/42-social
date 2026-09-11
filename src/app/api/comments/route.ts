import { NextResponse } from "next/server";
import { readDB, updateDB, uid, type QuotedReply } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit, isDuplicate } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

// Max 6 comments/min per user, min 3s between comments, no repeat text/60s.
const PER_MIN = 6;
const GAP_MS = 3_000;

export async function GET(req: Request) {
  const postId = new URL(req.url).searchParams.get("postId") ?? "";
  const db = await readDB();
  const byId = new Map(db.users.map((u) => [u.id, u]));
  return NextResponse.json({
    comments: db.comments
      .filter((c) => c.postId === postId && !c.deleted)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => {
        const a = byId.get(c.authorId);
        return {
          ...c,
          author: a
            ? { id: a.id, name: a.name, login42: a.login42 }
            : null,
        };
      }),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const gap = rateLimit(`comment-gap:${session.sub}`, 1, GAP_MS);
  if (!gap.ok)
    return NextResponse.json(
      { error: "slow", retryAfter: gap.retryAfter },
      { status: 429, headers: { "Retry-After": String(gap.retryAfter) } }
    );
  const vol = rateLimit(`comment-vol:${session.sub}`, PER_MIN, 60_000);
  if (!vol.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: vol.retryAfter },
      { status: 429, headers: { "Retry-After": String(vol.retryAfter) } }
    );
  if (isDuplicate(`comment-dupe:${session.sub}`, `${postId}:${text}`, 60_000))
    return NextResponse.json({ error: "duplicate" }, { status: 429 });

  const result = await updateDB((db) => {
    const post = db.posts.find((p) => p.id === postId);
    if (!post) return null;
    let replyTo: QuotedReply = null;
    if (replyToId) {
      const target = db.comments.find(
        (x) => x.id === replyToId && x.postId === postId && !x.deleted
      );
      if (target) {
        const tu = db.users.find((u) => u.id === target.authorId);
        replyTo = {
          id: target.id,
          body:
            target.kind === "sticker" ? "Sticker" : clean(target.body, 120),
          name: tu ? tu.name : "Unknown",
          senderId: target.authorId,
        };
      }
    }
    const c = {
      id: uid("c"),
      postId,
      authorId: session.sub,
      body: text,
      kind: (kind === "sticker" ? "sticker" : "text") as "text" | "sticker",
      edited: false,
      deleted: false,
      replyTo,
      createdAt: new Date().toISOString(),
    };
    db.comments.push(c);
    if (post.authorId !== session.sub) {
      db.notifications.unshift({
        id: uid("n"),
        userId: post.authorId,
        kind: "comment",
        fromId: session.sub,
        postId,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
    const author = db.users.find((u) => u.id === session.sub);
    return {
      comment: {
        ...c,
        author: author
          ? { id: author.id, name: author.name, login42: author.login42 }
          : null,
      },
      total: db.comments.filter((x) => x.postId === postId && !x.deleted)
        .length,
    };
  });
  if (!result)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result, { status: 201 });
}
