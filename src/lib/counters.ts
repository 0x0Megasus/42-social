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
  // Storage-key writes: entries carry the real RTDB key, which survives
  // delete-tombstone holes that a compacted loop index would miss.
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
    // Rows without an id can't be counted or mirrored — skip them.
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
    // Skip id-less rows (partial ghost rows from the old index bug must
    // never be mirrored into the keyed maps).
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

// Best-effort +/-1 leaf bump of a user counter. Resolves the real RTDB
// storage key (user rows are append-only, but deletes elsewhere can still
// leave null holes that a compacted findIndex would miss).
// Races self-heal via recompute-on-touch / backfill.
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

// Pure predicate for the backfill: write the counter when it is missing
// OR drifted. Deletes never decremented postsCount, so stored zeros can be
// wrong — correcting them here heals history. Post/follow activity is
// low-frequency and every touch recomputes from a fresh read, so a raced
// correction self-heals on next activity. (Post likes/comments stay
// missing-only: they toggle far more often, so the race window matters.)
export function counterNeedsWrite(cur: unknown, want: number): boolean {
  return typeof cur !== "number" || cur !== want;
}

// Pure counter: live (non-deleted) posts authored by userId. Extracted so
// the recount logic is unit-tested without a database.
export function countLivePostsByAuthor(
  posts: { deleted?: boolean; authorId?: string }[],
  userId: string
): number {
  return posts.filter((p) => !p.deleted && p.authorId === userId).length;
}

// Exact recompute of one user's postsCount. Called after post delete —
// deletes used to never touch the counter, so it drifted high (profile /
// explore kept showing deleted posts). Exact recompute also heals any prior
// drift. Writes the map row + array leaf (storage-key addressed) and busts
// the 30s cached profile read.
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
  // Never create a partial map row for a user the backfill hasn't mirrored.
  if (mapRow && typeof mapRow === "object")
    paths[`/users-by-id/${userId}/postsCount`] = count;
  if (Object.keys(paths).length === 0) return null;
  await updatePaths(paths).catch(() => null);
  bustUserCache(userId);
  return count;
}
// Exact recount of one post's engagement: keyed map ∪ legacy array rows
// (union, so pre-map rows keep counting until the backfill mirrors them).
// Writes the denormalized counters back for O(1) feed reads.
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
  // Storage-key write — a compacted findIndex would stamp these counters
  // onto the wrong slot (the ghost-post bug) once deletes left holes.
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
