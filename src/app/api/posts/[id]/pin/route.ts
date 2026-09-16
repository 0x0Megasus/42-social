import { NextResponse } from "next/server";
import {
  cachedUserById,
  readCollectionEntries,
  readPostById,
  updatePaths,
  writePostById,
} from "@/lib/db";
import { isSupportUser } from "@/lib/support";
import { recountPost } from "@/lib/counters";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/posts/[id]/pin { pinned: boolean } — founder announcement.
// Support users can pin their OWN posts; pinned posts top everyone's feed.
// Triple-write: by-id map row + array leaf + /pinned-posts index (the feed
// discovers pinned posts through the index, never a full scan).
export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { pinned } = (await req.json().catch(() => ({}))) as {
    pinned?: boolean;
  };
  if (typeof pinned !== "boolean")
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const lim = rateLimit(`pin:${session.sub}`, 10, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const me = await cachedUserById(session.sub).catch(() => null);
  if (!isSupportUser(me ?? undefined))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = await readPostById(id);
  if (!p || p.deleted)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.authorId !== session.sub)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const next = {
    ...p,
    pinned,
    // Re-pinning refreshes the timestamp so it jumps back to the top.
    pinnedAt: pinned ? new Date().toISOString() : null,
  };
  await writePostById(id, next);
  // Array leaf addressed by the real storage key (see collectionEntries).
  const entries = await readCollectionEntries("posts");
  const hit = entries.find(({ row }) => row.id === id);
  const paths: Record<string, unknown> = {
    [`/pinned-posts/${id}`]: pinned
      ? { postId: id, pinnedAt: next.pinnedAt }
      : null,
  };
  if (hit) {
    paths[`/posts/${hit.key}/pinned`] = pinned;
    paths[`/posts/${hit.key}/pinnedAt`] = next.pinnedAt;
  }
  await updatePaths(paths);
  const counts = await recountPost(id).catch(() => null);
  const author = await cachedUserById(p.authorId).catch(() => null);
  return NextResponse.json({
    post: {
      ...next,
      author:
        next.author ??
        (author
          ? {
              id: author.id,
              name: author.name,
              login42: author.login42,
              avatar: author.avatar,
              campus: author.campus,
            }
          : null),
      likes: counts?.likes ?? next.likesCount ?? 0,
      comments: counts?.comments ?? next.commentsCount ?? 0,
    },
  });
}
