import {
  bustUserCache,
  chunkedUpdate,
  encodeEmailKey,
  newPushKey,
  queryCollection,
  queryCollectionEntries,
  readCollection,
  readCollectionEntries,
  readPath,
  updatePaths,
} from "@/lib/db";


let backfillStarted = false;

export function ensureCountersBackfilled(): void {
  if (backfillStarted) return;
  backfillStarted = true;
  void backfill().catch(() => {
    backfillStarted = false;
  });
}

async function backfill(): Promise<void> {
  const [postEntries, likes, comments, userEntries, follows] = await Promise.all([
    readCollectionEntries("posts"),
    readCollection("likes"),
    readCollection("comments"),
    readCollectionEntries("users"),
    readCollection("follows"),
  ]);
  const posts = postEntries.map(({ row }) => row);
  const users = userEntries.map(({ row }) => row);
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
  postEntries.forEach(({ key, row: p }) => {
    if (typeof p.likesCount !== "number") {
      p.likesCount = likeCount.get(p.id) ?? 0;
      paths[`/posts/${key}/likesCount`] = p.likesCount;
    }
    if (typeof p.commentsCount !== "number") {
      p.commentsCount = commentCount.get(p.id) ?? 0;
      paths[`/posts/${key}/commentsCount`] = p.commentsCount;
    }
  });
  userEntries.forEach(({ key, row: u }) => {
    if (typeof u.id !== "string" || !u.id) return;
    if (counterNeedsWrite(u.postsCount, postsByAuthor.get(u.id) ?? 0)) {
      u.postsCount = postsByAuthor.get(u.id) ?? 0;
      paths[`/users/${key}/postsCount`] = u.postsCount;
    }
    if (counterNeedsWrite(u.followersCount, followers.get(u.id) ?? 0)) {
      u.followersCount = followers.get(u.id) ?? 0;
      paths[`/users/${key}/followersCount`] = u.followersCount;
    }
    if (counterNeedsWrite(u.followingCount, following.get(u.id) ?? 0)) {
      u.followingCount = following.get(u.id) ?? 0;
      paths[`/users/${key}/followingCount`] = u.followingCount;
    }
    if (typeof u.nameLower !== "string") {
      u.nameLower = u.name.toLowerCase();
      paths[`/users/${key}/nameLower`] = u.nameLower;
    }
  });
  await updatePaths(paths);

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
    if (mirroredNotifIds.has(n.id)) continue;
    mirror.push([
      `/notifications-by-user/${n.userId}/${newPushKey(`notifications-by-user/${n.userId}`)}`,
      n,
    ]);
  }
  for (const u of users) {
    if (typeof u.id !== "string" || !u.id) continue;
    mirror.push([`/users-by-id/${u.id}`, u]);
    mirror.push([`/users-by-handle/${u.id.toLowerCase()}`, u.id]);
    if (typeof u.name === "string" && u.name)
      mirror.push([`/users-by-handle/${u.name.toLowerCase()}`, u.id]);
    if (u.login42)
      mirror.push([`/users-by-handle/${u.login42.toLowerCase()}`, u.id]);
    if (u.email)
      mirror.push([`/users-by-email/${encodeEmailKey(u.email)}`, u.id]);
  }
  for (const p of posts) {
    if (typeof p.id !== "string" || !p.id) continue;
    mirror.push([`/posts-by-id/${p.id}`, p]);
  }
  await chunkedUpdate(mirror);
}

export async function bumpUserCounter(
  userId: string,
  field: "postsCount" | "followersCount" | "followingCount",
  delta: number
): Promise<void> {
  const entries = await readCollectionEntries("users");
  const hit = entries.find(({ row }) => row.id === userId);
  if (!hit) return;
  const cur = hit.row[field];
  await updatePaths({
    [`/users/${hit.key}/${field}`]:
      typeof cur === "number" ? cur + delta : delta > 0 ? 1 : 0,
  });
}

export function counterNeedsWrite(cur: unknown, want: number): boolean {
  return typeof cur !== "number" || cur !== want;
}

export function countLivePostsByAuthor(
  posts: { deleted?: boolean; authorId?: string }[],
  userId: string
): number {
  return posts.filter((p) => !p.deleted && p.authorId === userId).length;
}

export async function recountUserPosts(
  userId: string
): Promise<number | null> {
  const [postEntries, userEntries, mapRow] = await Promise.all([
    readCollectionEntries("posts").catch(() => []),
    readCollectionEntries("users").catch(() => []),
    readPath<Record<string, unknown>>(`/users-by-id/${userId}`).catch(
      () => null
    ),
  ]);
  const count = countLivePostsByAuthor(
    postEntries.map(({ row }) => row),
    userId
  );
  const paths: Record<string, unknown> = {};
  const hit = userEntries.find(({ row }) => row.id === userId);
  if (hit) paths[`/users/${hit.key}/postsCount`] = count;
  if (mapRow && typeof mapRow === "object")
    paths[`/users-by-id/${userId}/postsCount`] = count;
  if (Object.keys(paths).length === 0) return null;
  await updatePaths(paths).catch(() => null);
  bustUserCache(userId);
  return count;
}
export async function recountPost(
  postId: string
): Promise<{ likes: number; comments: number } | null> {
  const [mapVal, legacyLikes, legacyComments, entries] = await Promise.all([
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
    readCollectionEntries("posts"),
  ]);
  const hit = entries.find(({ row }) => row.id === postId);
  if (!hit) return null;
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
    [`/posts/${hit.key}/likesCount`]: likes,
    [`/posts/${hit.key}/commentsCount`]: comments,
  }).catch(() => null);
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
