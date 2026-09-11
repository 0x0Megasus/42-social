import { NextResponse } from "next/server";
import { updateDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string }> };

async function ownComment(
  commentId: string,
  me: string,
  mutate: (c: { body: string; edited: boolean; deleted: boolean }) => void
) {
  return updateDB((db) => {
    const c = db.comments.find((x) => x.id === commentId);
    if (!c || c.authorId !== me || c.deleted) return null;
    mutate(c);
    const a = db.users.find((u) => u.id === c.authorId);
    return {
      ...c,
      author: a
        ? { id: a.id, name: a.name, login42: a.login42 }
        : null,
      total: db.comments.filter(
        (x) => x.postId === c.postId && !x.deleted
      ).length,
    };
  });
}

// PATCH /api/comments/[id] { body } — edit own comment. Readers see "edited".
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { body } = (await req.json().catch(() => ({}))) as {
    body?: string;
  };
  const text = clean(body, 300);
  if (!text) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const lim = rateLimit(`cmtedit:${session.sub}`, 10, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const result = await ownComment(id, session.sub, (c) => {
    c.body = text;
    c.edited = true;
  });
  if (!result)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}

// DELETE /api/comments/[id] — tombstone. Readers see "comment deleted".
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await ownComment(id, session.sub, (c) => {
    c.deleted = true;
  });
  if (!result)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}
