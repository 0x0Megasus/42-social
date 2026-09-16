
const GRAVITY = 1.6;
const LIKE_W = 2;
const COMMENT_W = 4;
const OWN_BOOST = 12;
const FOLLOW_BOOST = 10;
const INTERACTED_BOOST = 5;
const FRIEND_LIKE_W = 3;
const FRIEND_LIKE_CAP = 9;
const IMAGE_BOOST = 4;
const FRESH_HOURS = 3;
const FRESH_BOOST = 6;
const DEAD_AFTER_H = 48;
const DEAD_MULT = 0.15;

export type Rankable = {
  id: string;
  authorId: string;
  createdAt: string;
  likes: number;
  comments: number;
  hasImage: boolean;
  likerIds: string[];
};

export type RankContext = {
  meId: string | null;
  following: Set<string>;
  interactedAuthors: Set<string>;
};

export function postScore(
  p: Rankable,
  ctx: RankContext,
  now = Date.now()
): number {
  const ageH = Math.max(
    0.05,
    (now - new Date(p.createdAt).getTime()) / 3_600_000
  );
  let value = p.likes * LIKE_W + p.comments * COMMENT_W + 2;
  if (ctx.meId && p.authorId === ctx.meId) value += OWN_BOOST;
  else if (ctx.following.has(p.authorId)) value += FOLLOW_BOOST;
  else if (ctx.interactedAuthors.has(p.authorId)) value += INTERACTED_BOOST;
  if (ctx.following.size > 0 && p.likerIds.length > 0) {
    let friends = 0;
    for (const id of p.likerIds) {
      if (ctx.following.has(id)) {
        friends++;
        if (friends * FRIEND_LIKE_W >= FRIEND_LIKE_CAP) break;
      }
    }
    value += Math.min(friends * FRIEND_LIKE_W, FRIEND_LIKE_CAP);
  }
  if (p.hasImage) value += IMAGE_BOOST;
  if (ageH < FRESH_HOURS) value += FRESH_BOOST;
  let score = value / Math.pow(ageH + 2, GRAVITY);
  if (ageH > DEAD_AFTER_H && p.likes === 0 && p.comments === 0) {
    score *= DEAD_MULT;
  }
  return score;
}

export function rankFeed<T extends Rankable>(
  items: T[],
  ctx: RankContext,
  now = Date.now()
): T[] {
  const scored = items
    .map((p) => ({ p, s: postScore(p, ctx, now) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
  const out: T[] = [];
  const pool = [...scored];
  while (pool.length > 0) {
    const last = out.length > 0 ? out[out.length - 1] : null;
    const prev2 = out.length > 1 ? out[out.length - 2] : null;
    let idx = pool.findIndex(
      (p) =>
        (!last || p.authorId !== last.authorId) &&
        !(
          last &&
          prev2 &&
          p.hasImage === last.hasImage &&
          last.hasImage === prev2.hasImage
        )
    );
    if (idx === -1)
      idx = pool.findIndex((p) => !last || p.authorId !== last.authorId);
    if (idx === -1) idx = 0;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
