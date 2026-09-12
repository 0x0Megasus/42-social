// Feed ranking: Hacker News-style gravity with social affinity + diversity.
// score = (engagement + affinity) / (ageHours + 2) ^ GRAVITY
// - engagement: comments weigh more than likes (conversation > applause)
// - affinity: followed authors + own posts get a fair boost, not a monopoly
// - diversity: no two same-author posts back-to-back when avoidable
// Fresh posts with zero engagement still surface via the recency term.

const GRAVITY = 1.6;
const LIKE_W = 2;
const COMMENT_W = 3;
const FOLLOW_BOOST = 10;
const OWN_BOOST = 3;

export type Rankable = {
  id: string;
  authorId: string;
  createdAt: string;
  likes: number;
  comments: number;
};

export function postScore(
  p: Rankable,
  meId: string | null,
  following: Set<string>,
  now = Date.now()
): number {
  const ageH = Math.max(
    0.05,
    (now - new Date(p.createdAt).getTime()) / 3_600_000
  );
  let base = p.likes * LIKE_W + p.comments * COMMENT_W + 2;
  if (meId && p.authorId === meId) base += OWN_BOOST;
  if (following.has(p.authorId)) base += FOLLOW_BOOST;
  return base / Math.pow(ageH + 2, GRAVITY);
}

export function rankFeed<T extends Rankable>(
  items: T[],
  meId: string | null,
  followingIds: Iterable<string>,
  now = Date.now()
): T[] {
  const following = new Set(followingIds);
  const scored = items
    .map((p) => ({ p, s: postScore(p, meId, following, now) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
  // diversity pass: avoid same-author runs
  const out: T[] = [];
  const pool = [...scored];
  while (pool.length > 0) {
    const lastAuthor = out.length > 0 ? out[out.length - 1].authorId : null;
    let idx = pool.findIndex((p) => p.authorId !== lastAuthor);
    if (idx === -1) idx = 0;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
