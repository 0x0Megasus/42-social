import { NextResponse } from "next/server";
import {
  queryCollectionEntries,
  readPath,
  readUserById,
  setPath,
  transactLeaf,
  updatePaths,
} from "@/lib/db";
import { newNotification, pushNotification } from "@/lib/notifications";
import { bumpUserCounter } from "@/lib/counters";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { userId } = (await req.json().catch(() => ({}))) as {
    userId?: string;
  };
  if (!userId || userId === session.sub)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const lim = rateLimit(`follow:${session.sub}`, 20, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter) } }
    );
  const target = await readUserById(userId);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const byFollower = `/follows-by-follower/${session.sub}/${userId}`;
  const byFollowing = `/follows-by-following/${userId}/${session.sub}`;
  let following: boolean;
  const mapCur = await readPath<unknown>(byFollower).catch(() => null);
  if (!mapCur) {
    const legacy = await queryCollectionEntries("follows", {
      orderBy: "followerId",
      equalTo: session.sub,
      limit: 100_000,
    }).catch(() => []);
    const hit = legacy.find(({ row }) => row.followingId === userId);
    if (hit) {
      await updatePaths({ [`/follows/${hit.key}`]: null }).catch(() => null);
      following = false;
    } else {
      const tx = await transactLeaf(byFollower, (cur) => (cur ? null : true));
      following = tx.committed
        ? tx.snapshot.val() === true
        : (await readPath<unknown>(byFollower).catch(() => null)) != null;
    }
  } else {
    await setPath(byFollower, null).catch(() => null);
    following = false;
    const legacy = await queryCollectionEntries("follows", {
      orderBy: "followerId",
      equalTo: session.sub,
      limit: 100_000,
    }).catch(() => []);
    const stale = legacy.filter(({ row }) => row.followingId === userId);
    if (stale.length > 0) {
      await updatePaths(
        Object.fromEntries(stale.map(({ key }) => [`/follows/${key}`, null]))
      ).catch(() => null);
    }
  }
  await setPath(byFollowing, following ? true : null).catch(() => null);
  await Promise.all([
    bumpUserCounter(userId, "followersCount", following ? 1 : -1),
    bumpUserCounter(session.sub, "followingCount", following ? 1 : -1),
  ]).catch(() => null);
  if (following) {
    await pushNotification(
      newNotification(userId, "follow", session.sub, null)
    ).catch(() => null);
  }
  return NextResponse.json({ following });
}
