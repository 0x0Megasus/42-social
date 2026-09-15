import {
  cachedUserById,
  queryCollection,
  readPath,
  type User,
} from "@/lib/db";

// Follow graph reads: keyed maps first, legacy array union for pre-map
// rows. Sets stay exact during and after the migration.

async function mapKeys(path: string): Promise<Set<string>> {
  const val = await readPath<Record<string, unknown>>(path).catch(() => null);
  if (!val || typeof val !== "object") return new Set();
  return new Set(
    Object.entries(val)
      .filter(([, v]) => !!v)
      .map(([k]) => k)
  );
}

/** Ids this user follows (for feed affinity + explore ticks). */
export async function followingIdsOf(meId: string): Promise<string[]> {
  const [map, legacy] = await Promise.all([
    mapKeys(`/follows-by-follower/${meId}`),
    queryCollection("follows", {
      orderBy: "followerId",
      equalTo: meId,
      limit: 100_000,
    }).catch(() => []),
  ]);
  for (const f of legacy) map.add(f.followingId);
  return [...map];
}

/** Ids following this user. */
export async function followerIdsOf(userId: string): Promise<string[]> {
  const [map, legacy] = await Promise.all([
    mapKeys(`/follows-by-following/${userId}`),
    queryCollection("follows", {
      orderBy: "followingId",
      equalTo: userId,
      limit: 100_000,
    }).catch(() => []),
  ]);
  for (const f of legacy) map.add(f.followerId);
  return [...map];
}

export type FollowUserLite = {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
};

function lite(u: User): FollowUserLite {
  return {
    id: u.id,
    name: u.name,
    handle: u.login42 ?? u.name,
    avatar: u.avatar ?? null,
  };
}

/** Follower/following user cards for the profile modal (capped). */
export async function followListsOf(
  userId: string,
  cap = 200
): Promise<{ followers: FollowUserLite[]; following: FollowUserLite[] }> {
  const [followerIds, followingIds] = await Promise.all([
    followerIdsOf(userId),
    followingIdsOf(userId),
  ]);
  const ids = [...new Set([...followerIds, ...followingIds])].slice(0, cap * 2);
  const users = await Promise.all(ids.map((id) => cachedUserById(id)));
  const byId = new Map(
    users.filter((u) => !!u).map((u) => [u!.id, lite(u!)])
  );
  return {
    followers: followerIds
      .slice(0, cap)
      .map((id) => byId.get(id))
      .filter((u): u is FollowUserLite => !!u),
    following: followingIds
      .slice(0, cap)
      .map((id) => byId.get(id))
      .filter((u): u is FollowUserLite => !!u),
  };
}
