import { NextResponse } from "next/server";
import { readDB, updateDB, uid, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit, isDuplicate } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";
import { rankFeed } from "@/lib/feed-rank";

export async function GET(req: Request) {
  const db = await readDB();
  const session = await getSession();
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const likeCount = new Map<string, number>();
  for (const l of db.likes) likeCount.set(l.postId, (likeCount.get(l.postId) ?? 0) + 1);
  const commentCount = new Map<string, number>();
  for (const c of db.comments)
    if (!c.deleted) commentCount.set(c.postId, (commentCount.get(c.postId) ?? 0) + 1);
  const enriched = [...db.posts]
    .filter((p) => !p.deleted)
    .map((p) => {
      const author = byId.get(p.authorId);
      return {
        ...p,
        author: author ? userPublic(author) : null,
        likes: likeCount.get(p.id) ?? 0,
        comments: commentCount.get(p.id) ?? 0,
        liked: session
          ? db.likes.some((l) => l.postId === p.id && l.userId === session.sub)
          : false,
      };
    });
  const sort = new URL(req.url).searchParams.get("sort");
  const ordered =
    sort === "new"
      ? enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : rankFeed(
          enriched,
          session?.sub ?? null,
          session
            ? db.follows
                .filter((f) => f.followerId === session.sub)
                .map((f) => f.followingId)
            : []
        );
  return NextResponse.json({ posts: ordered.slice(0, 50) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { body, image } = (await req.json().catch(() => ({}))) as {
    body?: string;
    image?: string;
  };
  const text = clean(body, 500);
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });

  // Max 5 posts / 5 min, no repeat text / 5 min.
  const vol = rateLimit(`post-vol:${session.sub}`, 5, 300_000);
  if (!vol.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: vol.retryAfter },
      { status: 429, headers: { "Retry-After": String(vol.retryAfter) } }
    );
  if (isDuplicate(`post-dupe:${session.sub}`, text, 300_000))
    return NextResponse.json({ error: "duplicate" }, { status: 429 });

  const post = await updateDB((db) => {
    const p = {
      id: uid("p"),
      authorId: session.sub,
      body: text,
      image: image ? String(image).slice(0, 2000) : null,
      edited: false,
      deleted: false,
      createdAt: new Date().toISOString(),
    };
    db.posts.push(p);
    return p;
  });
  return NextResponse.json({ post }, { status: 201 });
}
