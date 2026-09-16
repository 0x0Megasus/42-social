import { NextResponse } from "next/server";
import {
  cachedUserById,
  queryCollectionEntries,
  readCollectionEntries,
  readPath,
  readPostById,
  updatePaths,
  writePostById,
  type Post,
} from "@/lib/db";
import { isSupportUser } from "@/lib/support";
import { destroyAssets } from "@/lib/cloudinary-admin";
import { publicIdFromUrl } from "@/lib/cloudinary";
import { recountPost, recountUserPosts } from "@/lib/counters";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await readPostById(id);
  if (!p || p.deleted)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const [likeMap, myLike] = await Promise.all([
    readPath<Record<string, true>>(`/likes-by-post/${id}`).catch(() => null),
    readPath<unknown>(`/likes-by-post/${id}/${session.sub}`).catch(() => null),
  ]);
  let likes =
    likeMap && typeof likeMap === "object"
      ? Object.values(likeMap).filter(Boolean).length
      : 0;
  let liked = myLike != null;
  const legacy = await queryCollectionEntries("likes", {
    orderBy: "postId",
    equalTo: id,
    limit: 100_000,
  }).catch(() => []);
  for (const { row } of legacy) {
    if (
      row.userId !== undefined &&
      !(likeMap && (likeMap as Record<string, unknown>)[row.userId])
    ) {
      likes++;
      if (row.userId === session.sub) liked = true;
    }
  }
  const post = {
    ...p,
    author: p.author ?? null,
    likes: Math.max(p.likesCount ?? 0, likes),
    comments: p.commentsCount ?? 0,
    liked,
  };
  return NextResponse.json(
    { post },
    {
      headers: {
        "Cache-Control": "private, max-age=5, stale-while-revalidate=15",
      },
    }
  );
}

async function ownPost(
  postId: string,
  me: string,
  mutate: (p: { body: string; edited: boolean; deleted: boolean }) => void
) {
  const p = await readPostById(postId);
  if (!p || p.authorId !== me || p.deleted) return null;
  const next: Post = { ...p };
  mutate(next);
  await writePostById(postId, next);
  const entries = await readCollectionEntries("posts");
  const hit = entries.find(({ row }) => row.id === postId);
  if (hit) {
    await updatePaths({
      [`/posts/${hit.key}/body`]: next.body,
      [`/posts/${hit.key}/edited`]: next.edited,
      [`/posts/${hit.key}/deleted`]: next.deleted,
    }).catch(() => null);
  }
  const counts = await recountPost(postId).catch(() => null);
  const author = await cachedUserById(p.authorId).catch(() => null);
  return {
    ...next,
    author: next.author ??
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
  };
}

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

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await readPostById(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const me = await cachedUserById(session.sub).catch(() => null);
  const mine = p.authorId === session.sub && !p.deleted;
  if (!mine && !isSupportUser(me ?? undefined))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const [entries, likeEntries, commentEntries, likers] = await Promise.all([
    readCollectionEntries("posts"),
    queryCollectionEntries("likes", {
      orderBy: "postId",
      equalTo: id,
      limit: 100_000,
    }).catch(() => []),
    queryCollectionEntries("comments", {
      orderBy: "postId",
      equalTo: id,
      limit: 100_000,
    }).catch(() => []),
    readPath<Record<string, true>>(`/likes-by-post/${id}`).catch(() => null),
  ]);
  const hit = entries.find(({ row }) => row.id === id);
  const paths: Record<string, unknown> = {
    [`/posts-by-id/${id}`]: null,
    [`/likes-by-post/${id}`]: null,
    [`/pinned-posts/${id}`]: null,
  };
  if (hit) paths[`/posts/${hit.key}`] = null;
  for (const { key } of likeEntries) paths[`/likes/${key}`] = null;
  for (const { key } of commentEntries) paths[`/comments/${key}`] = null;
  if (likers && typeof likers === "object") {
    for (const liker of Object.keys(likers))
      paths[`/likes-by-user/${liker}/${id}`] = null;
  }
  await updatePaths(paths);
  await recountUserPosts(p.authorId).catch(() => null);
  void destroyAssets([
    ...(p.cloudIds ?? []),
    publicIdFromUrl(p.image ?? ""),
    publicIdFromUrl(p.thumb ?? ""),
    publicIdFromUrl(p.video?.url ?? ""),
    publicIdFromUrl(p.video?.thumb ?? ""),
  ]);
  return NextResponse.json({ ok: true, id });
}
