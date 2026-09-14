import { NextResponse } from "next/server";
import { readDB, updateDB, userPublic } from "@/lib/db";
import { isSupportUser } from "@/lib/support";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/posts/[id] — requires session, returns enriched post
export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = await readDB();
  const p = db.posts.find((x) => x.id === id && !x.deleted);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const author = db.users.find((u) => u.id === p.authorId);
  const likes = db.likes.filter((l) => l.postId === id).length;
  const comments = db.comments.filter((c) => c.postId === id && !c.deleted).length;
  const liked = db.likes.some((l) => l.postId === id && l.userId === session.sub);
  const post = {
    ...p,
    author: author ? userPublic(author) : null,
    likes,
    comments,
    liked,
  };
  return NextResponse.json({ post });
}

async function ownPost(
  postId: string,
  me: string,
  mutate: (p: { body: string; edited: boolean; deleted: boolean }) => void
) {
  return updateDB((db) => {
    const p = db.posts.find((x) => x.id === postId);
    if (!p || p.authorId !== me || p.deleted) return null;
    mutate(p);
    const likes = db.likes.filter((l) => l.postId === postId).length;
    const comments = db.comments.filter(
      (c) => c.postId === postId && !c.deleted
    ).length;
    return { ...p, likes, comments };
  });
}

// PATCH /api/posts/[id] { body } — edit own post. Readers see "Edited".
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { body } = (await req.json().catch(() => ({}))) as {
    body?: string;
  };
  const text = clean(body, 500);
  if (!text) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const lim = rateLimit(`postedit:${session.sub}`, 10, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const post = await ownPost(id, session.sub, (p) => {
    p.body = text;
    p.edited = true;
  });
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ post });
}

// DELETE /api/posts/[id] — hard delete. The post row is removed from the DB
// together with its likes + comments, so no orphan rows pile up.
// (Notifications referencing it are kept as history; opening one shows the
// "no longer available" notice via the feed focus guard.)
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const removed = await updateDB((db) => {
    const idx = db.posts.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    const p = db.posts[idx];
    // Owners delete their own live posts; support can remove anything,
    // including legacy soft-deleted rows (p.deleted cleanup).
    const me = db.users.find((u) => u.id === session.sub);
    const mine = p.authorId === session.sub && !p.deleted;
    if (!mine && !isSupportUser(me)) return null;
    db.posts.splice(idx, 1);
    db.likes = db.likes.filter((l) => l.postId !== id);
    db.comments = db.comments.filter((c) => c.postId !== id);
    return { id };
  });
  if (!removed) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}
