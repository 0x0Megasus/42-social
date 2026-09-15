import {
  chunkedUpdate,
  newPushKey,
  queryCollection,
  queryCollectionEntries,
  readCollection,
  readPath,
  updatePaths,
} from "@/lib/db";

// Denormalized counters keep hot reads O(page) instead of O(table):
// feeds render likes/comments per post and explore renders post/follower
// counts per user without scanning /likes, /comments, or /follows.
//
// Maintained on every write (like toggle, comment, post, follow) and
// backfilled once per instance for legacy rows. The backfill only writes
// MISSING fields; a concurrent write racing it recomputes exact values on
// touch, so any lost backfill write self-heals on next activity.

let backfillStarted = false;

export function ensureCountersBackfilled(): void {
  if (backfillStarted) return;
  backfillStarted = true;
  void backfill().catch(() => {
    // A failed backfill must not wedge future attempts in long-lived
    // processes — allow exactly one retry on the next call.
    backfillStarted = false;
  });
}

async function backfill(): Promise<void> {
  const [posts, likes, comments, users, follows] = await Promise.all([
    readCollection("posts"),
    readCollection("likes"),
    readCollection("comments"),
    readCollection("users"),
    readCollection("follows"),
  ]);
  const likeCount = new Map<string, number>();
  for (const l of likes)
    likeCount.set(l.postId, (likeCount.get(l.postId) ?? 0) + 1);
  const commentCount = new Map<string, number>();
  for (const c of comments)
    if (!c.deleted)
      commentCount.set(c.postId, (commentCount.get(c.postId) ?? 0) + 1);
  const postsByAuthor = new Map<string, number>();
  for (const p of posts)
    if (!p.deleted)
      postsByAuthor.set(p.authorId, (postsByAuthor.get(p.authorId) ?? 0) + 1);
  const followers = new Map<string, number>();
  const following = new Map<string, number>();
  for (const f of follows) {
    followers.set(f.followingId, (followers.get(f.followingId) ?? 0) + 1);
    following.set(f.followerId, (following.get(f.followerId) ?? 0) + 1);
  }
  const paths: Record<string, unknown> = {};
  posts.forEach((p, i) => {
    if (typeof p.likesCount !== "number") {
      p.likesCount = likeCount.get(p.id) ?? 0;
      paths[`/posts/${i}/likesCount`] = p.likesCount;
    }
    if (typeof p.commentsCount !== "number") {
      p.commentsCount = commentCount.get(p.id) ?? 0;
      paths[`/posts/${i}/commentsCount`] = p.commentsCount;
    }
  });
  users.forEach((u, i) => {
    if (typeof u.postsCount !== "number") {
      u.postsCount = postsByAuthor.get(u.id) ?? 0;
      paths[`/users/${i}/postsCount`] = u.postsCount;
    }
    if (typeof u.followersCount !== "number") {
      u.followersCount = followers.get(u.id) ?? 0;
      paths[`/users/${i}/followersCount`] = u.followersCount;
    }
    if (typeof u.followingCount !== "number") {
      u.followingCount = following.get(u.id) ?? 0;
      paths[`/users/${i}/followingCount`] = u.followingCount;
    }
    if (typeof u.nameLower !== "string") {
      u.nameLower = u.name.toLowerCase();
      paths[`/users/${i}/nameLower`] = u.nameLower;
    }
  });
  await updatePaths(paths);

  // Mirror legacy array rows into the keyed maps (idempotent — same leaf
  // paths every run, so repeats and deploy overlaps are harmless).
  const mirror: [string, unknown][] = [];
  for (const l of likes) {
    mirror.push([`/likes-by-post/${l.postId}/${l.userId}`, true]);
    mirror.push([`/likes-by-user/${l.userId}/${l.postId}`, true]);
  }
  for (const f of follows) {
    mirror.push([
      `/follows-by-follower/${f.followerId}/${f.followingId}`,
      true,
    ]);
    mirror.push([
      `/follows-by-following/${f.followingId}/${f.followerId}`,
      true,
    ]);
  }
  const notifMap = await readPath<
    Record<string, Record<string, { id?: string }>>
  >("/notifications-by-user").catch(() => null);
  const mirroredNotifIds = new Set<string>();
  if (notifMap && typeof notifMap === "object") {
    for (const bucket of Object.values(notifMap)) {
      if (bucket && typeof bucket === "object") {
        for (const n of Object.values(bucket)) {
          if (n && typeof n.id === "string") mirroredNotifIds.add(n.id);
        }
      }
    }
  }
  const allNotifs = await readCollection("notifications");
  for (const n of allNotifs) {
    // Skip already-mirrored rows: push-keys differ per run, so without
    // this check every backfill would duplicate the map entries.
    if (mirroredNotifIds.has(n.id)) continue;
    mirror.push([
      `/notifications-by-user/${n.userId}/${newPushKey(`notifications-by-user/${n.userId}`)}`,
      n,
    ]);
  }
  for (const u of users) {
    mirror.push([`/users-by-id/${u.id}`, u]);
    mirror.push([`/users-by-handle/${u.id.toLowerCase()}`, u.id]);
    mirror.push([`/users-by-handle/${u.name.toLowerCase()}`, u.id]);
    if (u.login42)
      mirror.push([`/users-by-handle/${u.login42.toLowerCase()}`, u.id]);
  }
  for (const p of posts) mirror.push([`/posts-by-id/${p.id}`, p]);
  await chunkedUpdate(mirror);
}

// Best-effort +/-1 leaf bump of a user counter. Reads /users fresh to
// resolve the array index (user rows are append-only, so indices are
// stable). Races self-heal via recompute-on-touch / backfill.
export async function bumpUserCounter(
  userId: string,
  field: "postsCount" | "followersCount" | "followingCount",
  delta: number
): Promise<void> {
  const users = await readCollection("users");
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return;
  const cur = users[idx][field];
  await updatePaths({
    [`/users/${idx}/${field}`]:
      typeof cur === "number" ? cur + delta : delta > 0 ? 1 : 0,
  });
}

// Exact recount of one post's engagement: keyed map ∪ legacy array rows
// (union, so pre-map rows keep counting until the backfill mirrors them).
// Writes the denormalized counters back for O(1) feed reads.
export async function recountPost(
  postId: string
): Promise<{ likes: number; comments: number } | null> {
  const [mapVal, legacyLikes, legacyComments, posts] = await Promise.all([
    readPath<Record<string, true>>(`/likes-by-post/${postId}`).catch(
      () => null
    ),
    queryCollectionEntries("likes", {
      orderBy: "postId",
      equalTo: postId,
      limit: 100_000,
    }).catch((): { key: string; row: { userId: string } }[] => []),
    queryCollection("comments", {
      orderBy: "postId",
      equalTo: postId,
      limit: 100_000,
    }).catch(() => []),
    readCollection("posts"),
  ]);
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx < 0) return null;
  const mapKeys =
    mapVal && typeof mapVal === "object"
      ? new Set(
          Object.entries(mapVal)
            .filter(([, v]) => !!v)
            .map(([k]) => k)
        )
      : new Set<string>();
  for (const { row } of legacyLikes) mapKeys.add(row.userId);
  const likes = mapKeys.size;
  const comments = legacyComments.filter((c) => !c.deleted).length;
  await updatePaths({
    [`/posts/${idx}/likesCount`]: likes,
    [`/posts/${idx}/commentsCount`]: comments,
  }).catch(() => null);
  // Keep the by-id map row in sync — but only if it exists (never create
  // a partial row for a legacy post the backfill hasn't mirrored yet).
  const mapRow = await readPath<Record<string, unknown>>(
    `/posts-by-id/${postId}`
  ).catch(() => null);
  if (mapRow && typeof mapRow === "object") {
    await updatePaths({
      [`/posts-by-id/${postId}/likesCount`]: likes,
      [`/posts-by-id/${postId}/commentsCount`]: comments,
    }).catch(() => null);
  }
  return { likes, comments };
}
