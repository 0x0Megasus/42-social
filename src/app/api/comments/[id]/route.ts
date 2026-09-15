import { NextResponse } from "next/server";
import {
  queryCollectionEntries,
  setPath,
  type Comment,
} from "@/lib/db";
import { recountPost } from "@/lib/counters";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string }> };

async function ownComment(
  commentId: string,
  me: string,
  mutate: (c: { body: string; edited: boolean; deleted: boolean }) => void
) {
  // Indexed id lookup (no collection scan), then a direct write.
  // NOTE: not a transaction — firebase-admin runs the tx updater against
  // the LOCAL guess (null) first, so "abort when absent" never reaches the
  // server. Read-verify-write is safe here: only the owner can mutate
  // their own rows, so concurrent writers are always the same user and
  // last-writer-wins is correct.
  const hits = await queryCollectionEntries("comments", {
    orderBy: "id",
    equalTo: commentId,
    limit: 5,
  }).catch(() => []);
  const hit = hits.find(
    ({ row }) => row.authorId === me && !row.deleted
  );
  if (!hit) return null;
  const next: Comment = { ...hit.row };
  mutate(next);
  await setPath(`/comments/${hit.key}`, next);
  const counts = await recountPost(next.postId).catch(() => null);
  return {
    ...next,
    author: next.author ?? null,
    total: counts?.comments ?? 0,
  };
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
