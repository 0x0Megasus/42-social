import {
  cachedUserById,
  queryCollection,
  readPath,
  readPostById,
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
export const MAX_PINNED = 5;

export type PinnedIndexEntry = { postId?: string; pinnedAt?: string };

export function selectPinnedPosts(posts: Post[], max = MAX_PINNED): Post[] {
  return posts
    .filter(
      (p) =>
        p.pinned &&
        !p.deleted &&
        typeof p.id === "string" &&
        p.id
    )
    .sort((a, b) =>
      String(b.pinnedAt ?? "").localeCompare(String(a.pinnedAt ?? ""))
    )
    .slice(0, max);
}
const INVENTORY = 500;
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
  preMaps?: Map<string, Record<string, true> | null>
): Promise<FeedPost[]> {
  const likeData = await Promise.all(
    posts.map(async (p) => {
      if (typeof p.id !== "string" || !p.id)
        return { count: 0, mine: false };
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
  const needAuthor = new Map<string, Promise<unknown>>();
  for (const p of posts) {
    if (
      !p.author &&
      typeof p.authorId === "string" &&
      p.authorId &&
      !needAuthor.has(p.authorId)
    ) {
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
  const [rows, pinnedIndex] = await Promise.all([
    queryCollection("posts", {
      orderBy: "createdAt",
      limit: INVENTORY,
    }),
    readPath<Record<string, PinnedIndexEntry>>("/pinned-posts").catch(
      () => null
    ),
  ]);
  const indexed =
    pinnedIndex && typeof pinnedIndex === "object"
      ? Object.values(pinnedIndex)
      : [];
  const pinnedCandidates = (
    await Promise.all(
      indexed.map((e) =>
        e && typeof e.postId === "string" && e.postId
          ? readPostById(e.postId).catch(() => null)
          : null
      )
    )
  ).filter((p): p is Post => !!p);
  const pinned = selectPinnedPosts(pinnedCandidates);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const live = rows.filter(
    (p) =>
      !p.deleted &&
      typeof p.id === "string" &&
      p.id &&
      typeof p.authorId === "string" &&
      p.authorId &&
      !pinnedIds.has(p.id)
  );
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
    hasImage: !!p.image || !!p.video,
    likerIds,
  });
  const stage1 = rankFeed(live.map((p) => shaped(p)), ctx);
  const end = offset + limit;
  const shortlist = stage1.slice(
    0,
    Math.min(INVENTORY, Math.max(RERANK, end))
  );
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
  const page = ranked.slice(offset, offset + limit);
  const enriched = await enrichPosts(page, meId, maps);
  if (offset === 0 && pinned.length > 0) {
    const enrichedPinned = await enrichPosts(pinned, meId);
    return {
      posts: [...enrichedPinned, ...enriched],
      hasMore: end < stage1.length,
    };
  }
  return {
    posts: enriched,
    hasMore: end < stage1.length,
  };
}

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
