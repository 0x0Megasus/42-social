import { NextResponse } from "next/server";
import { readDB, updateDB, uid, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit, isDuplicate } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

export async function GET() {
  const db = await readDB();
  const session = await getSession();
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const posts = [...db.posts]
    .filter((p) => !p.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map((p) => {
      const author = byId.get(p.authorId);
      const likes = db.likes.filter((l) => l.postId === p.id).length;
      const comments = db.comments.filter(
        (c) => c.postId === p.id && !c.deleted
      ).length;
      return {
        ...p,
        author: author ? userPublic(author) : null,
        likes,
        comments,
        liked: session
          ? db.likes.some((l) => l.postId === p.id && l.userId === session.sub)
          : false,
      };
    });
  return NextResponse.json({ posts });
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
