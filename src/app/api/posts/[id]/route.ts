import { NextResponse } from "next/server";
import { updateDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string }> };

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

// DELETE /api/posts/[id] — tombstone. Readers see "Post deleted".
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const post = await ownPost(id, session.sub, (p) => {
    p.deleted = true;
  });
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ post });
}
