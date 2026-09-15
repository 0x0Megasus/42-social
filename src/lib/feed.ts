import {
  cachedUserById,
  queryCollection,
  readPath,
  userPublic,
  type AuthorSnapshot,
  type Comment,
  type Post,
} from "@/lib/db";
import { isSupportUser } from "@/lib/support";
import { followingIdsOf } from "@/lib/graph";
import { rankFeed } from "@/lib/feed-rank";
import type { FeedPost } from "@/components/post-card";

export const FEED_PAGE = 20;
// Inventory size for the ranker (mirrors FB's ~500-candidate shortlist).
const INVENTORY = 500;
// Stage-2 full scoring (with friend-proof signals) runs on the top slice.
const RERANK = 60;
const MAX_LIMIT = 50;
const MAX_OFFSET = 480;

export type FeedPage = {
  posts: FeedPost[];
  hasMore: boolean;
};

function snapshotOf(p: Post): AuthorSnapshot | null {
  return p.author ?? null;
}

export async function enrichPosts(
  posts: Post[],
  meId: string | null,
  // Pre-fetched like maps (stage-2 ranking already read them) — skips
  // re-reading the map subtree per post; legacy union still queried.
  preMaps?: Map<string, Record<string, true> | null>
): Promise<FeedPost[]> {
  // Per-post like lookups (indexed map subtree ∪ legacy rows) keep cost
  // O(page) instead of O(all likes). Multiplexed over one RTDB socket.
  const likeData = await Promise.all(
    posts.map(async (p) => {
      const [mapVal, legacy] = await Promise.all([
        preMaps?.has(p.id)
          ? preMaps.get(p.id) ?? null
          : readPath<Record<string, true>>(`/likes-by-post/${p.id}`).catch(
              () => null
            ),
        queryCollection("likes", {
          orderBy: "postId",
          equalTo: p.id,
        }).catch(() => []),
      ]);
      const likers =
        mapVal && typeof mapVal === "object"
          ? new Set(
              Object.entries(mapVal)
                .filter(([, v]) => !!v)
                .map(([k]) => k)
            )
          : new Set<string>();
      for (const l of legacy) likers.add(l.userId);
      return { count: likers.size, mine: meId ? likers.has(meId) : false };
    })
  );
  // Author fallback for legacy rows without snapshots (cached 30s).
  const needAuthor = new Map<string, Promise<unknown>>();
  for (const p of posts) {
    if (!p.author && !needAuthor.has(p.authorId)) {
      needAuthor.set(
        p.authorId,
        cachedUserById(p.authorId).catch(() => null)
      );
    }
  }
  const authors = new Map<string, unknown>();
  for (const [id, promise] of needAuthor) authors.set(id, await promise);
  return posts.map((p, i) => {
    const info = likeData[i] ?? { count: 0, mine: false };
    let author = snapshotOf(p);
    if (!author) {
      const u = authors.get(p.authorId) as Parameters<
        typeof userPublic
      >[0] | null;
      author = u
        ? {
            id: u.id,
            name: u.name,
            login42: u.login42,
            avatar: u.avatar,
            campus: u.campus,
            isSupport: isSupportUser(u),
          }
        : null;
    }
    return {
      ...p,
      author,
      // Counter for speed, fresh union as floor — never stale-low.
      likes: Math.max(p.likesCount ?? 0, info.count),
      comments: p.commentsCount ?? 0,
      liked: info.mine,
    };
  });
}

export async function getFeedPage(opts: {
  meId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<FeedPage> {
  const limit = Math.min(Math.max(opts.limit ?? FEED_PAGE, 1), MAX_LIMIT);
  const offset = Math.min(Math.max(opts.offset ?? 0, 0), MAX_OFFSET);
  const meId = opts.meId ?? null;
  // -- 1. INVENTORY: recent candidates, indexed, bounded --
  const rows = await queryCollection("posts", {
    orderBy: "createdAt",
    limit: INVENTORY,
  });
  const live = rows.filter((p) => !p.deleted);
  // -- 2. SIGNALS: relationship context (one query each, both bounded) --
  const followingSet = new Set<string>();
  const myLiked = new Set<string>();
  if (meId) {
    const [followingIds, myLikes] = await Promise.all([
      followingIdsOf(meId).catch(() => [] as string[]),
      queryCollection("likes", {
        orderBy: "userId",
        equalTo: meId,
        limit: 2000,
      }).catch(() => []),
    ]);
    for (const id of followingIds) followingSet.add(id);
    for (const l of myLikes) myLiked.add(l.postId);
  }
  const interacted = new Set(
    live.filter((p) => myLiked.has(p.id)).map((p) => p.authorId)
  );
  const ctx = { meId, following: followingSet, interactedAuthors: interacted };
  const shaped = (p: Post, likerIds: string[] = []) => ({
    ...p,
    likes: p.likesCount ?? 0,
    comments: p.commentsCount ?? 0,
    hasImage: !!p.image,
    likerIds,
  });
  // -- 3. STAGE-1 (lightweight filter): cheap signals over all candidates --
  const stage1 = rankFeed(live.map((p) => shaped(p)), ctx);
  // -- 4. STAGE-2 (full scoring): friend-proof signals on the shortlist.
  // The shortlist always covers the requested page, so deep offsets stay
  // correctly ordered (at higher read cost — deep pages are rare).
  const end = offset + limit;
  const shortlist = stage1.slice(
    0,
    Math.min(INVENTORY, Math.max(RERANK, end))
  );
  // -- 4. STAGE-2 (full scoring): friend-proof signals on the shortlist --
  const maps = new Map<string, Record<string, true> | null>();
  await Promise.all(
    shortlist.map(async (p) => {
      const m = await readPath<Record<string, true>>(
        `/likes-by-post/${p.id}`
      ).catch(() => null);
      maps.set(p.id, m && typeof m === "object" ? m : null);
    })
  );
  const likersOf = (id: string): string[] => {
    const m = maps.get(id);
    if (!m) return [];
    return Object.entries(m)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
  };
  const ranked = rankFeed(
    shortlist.map((p) => shaped(p, likersOf(p.id))),
    ctx
  );
  // -- 5. PAGE from the ranked list (hasMore against the full ranking,
  // not the shortlist) --
  const page = ranked.slice(offset, offset + limit);
  return {
    posts: await enrichPosts(page, meId, maps),
    hasMore: end < stage1.length,
  };
}

// Fill missing comment authors (pre-snapshot legacy rows) via cached
// profile lookups. New comments already carry snapshots — this only fires
// for old ones, one small batched lookup per missing author.
export async function enrichComments<T extends Comment>(
  comments: T[]
): Promise<(T & { author: AuthorSnapshot | null })[]> {
  const missing = new Map<string, Promise<unknown>>();
  for (const c of comments) {
    if (!c.author && !missing.has(c.authorId)) {
      missing.set(c.authorId, cachedUserById(c.authorId).catch(() => null));
    }
  }
  const resolved = new Map<string, unknown>();
  for (const [id, promise] of missing) resolved.set(id, await promise);
  return comments.map((c) => {
    if (c.author) return { ...c, author: c.author };
    const u = resolved.get(c.authorId) as Parameters<
      typeof userPublic
    >[0] | null;
    return {
      ...c,
      author: u
        ? {
            id: u.id,
            name: u.name,
            login42: u.login42,
            avatar: u.avatar,
            campus: u.campus,
            isSupport: isSupportUser(u),
          }
        : null,
    };
  });
}
