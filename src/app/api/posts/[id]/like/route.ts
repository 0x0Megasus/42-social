import { NextResponse } from "next/server";
import {
  queryCollectionEntries,
  readPath,
  readPostById,
  setPath,
  transactLeaf,
  updatePaths,
} from "@/lib/db";
import { newNotification, pushNotification } from "@/lib/notifications";
import { recountPost } from "@/lib/counters";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`like:${session.sub}`, 30, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter) } }
    );
  const { id } = await params;
  const post = await readPostById(id);
  if (!post || post.deleted)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  // O(1) toggle on the keyed leaf — cost is independent of total likes.
  const byPost = `/likes-by-post/${id}/${session.sub}`;
  const byUser = `/likes-by-user/${session.sub}/${id}`;
  let liked: boolean;
  const mapCur = await readPath<unknown>(byPost).catch(() => null);
  if (!mapCur) {
    // Pre-map legacy row? Then this tap is an UNLIKE — delete the legacy
    // leaf instead of creating a map leaf (post-backfill this never hits).
    const legacy = await queryCollectionEntries("likes", {
      orderBy: "postId",
      equalTo: id,
      limit: 100_000,
    }).catch(() => []);
    const hit = legacy.find(({ row }) => row.userId === session.sub);
    if (hit) {
      await updatePaths({ [`/likes/${hit.key}`]: null }).catch(() => null);
      liked = false;
    } else {
      const tx = await transactLeaf(byPost, (cur) => (cur ? null : true));
      liked = tx.committed
        ? tx.snapshot.val() === true
        : (await readPath<unknown>(byPost).catch(() => null)) != null;
    }
  } else {
    await setPath(byPost, null).catch(() => null);
    liked = false;
    // Hygiene: drop any pre-map duplicate for this exact like so the
    // legacy array stops growing stale rows (count stays exact regardless
    // via union in recountPost).
    const legacy = await queryCollectionEntries("likes", {
      orderBy: "postId",
      equalTo: id,
      limit: 100_000,
    }).catch(() => []);
    const stale = legacy.filter(({ row }) => row.userId === session.sub);
    if (stale.length > 0) {
      await updatePaths(
        Object.fromEntries(stale.map(({ key }) => [`/likes/${key}`, null]))
      ).catch(() => null);
    }
  }
  if (liked) {
    await setPath(byUser, true).catch(() => null);
    if (post.authorId !== session.sub) {
      await pushNotification(
        newNotification(post.authorId, "like", session.sub, id)
      ).catch(() => null);
    }
  } else {
    await setPath(byUser, null).catch(() => null);
  }
  // Exact count (map ∪ legacy) + counter write-back for O(1) feed reads.
  const counts = await recountPost(id).catch(() => null);
  return NextResponse.json({ liked, likes: counts?.likes ?? 0 });
}
