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
    pinnedAt: pinned ? new Date().toISOString() : null,
  };
  await writePostById(id, next);
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
