import { queryCollection, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { beatsFor, isOnlineAt } from "@/lib/presence";
import { followingIdsOf } from "@/lib/graph";
import { ExploreClient } from "@/components/explore-client";

export const dynamic = "force-dynamic";

export default async function Explore() {
  const session = await getSession();
  // Latest 30 users via indexed query — O(30), not O(all users).
  const page = await queryCollection("users", {
    orderBy: "createdAt",
    limit: 30,
  }).catch(() => []);
  const users = [...page].reverse();
  const [beats, following] = await Promise.all([
    beatsFor(users.map((u) => u.id)),
    session ? followingIdsOf(session.sub).catch(() => []) : Promise.resolve([] as string[]),
  ]);
  const followingSet = new Set(following);
  const items = users.map((u) => {
    const pub = userPublic(u);
    return {
      id: u.id,
      name: pub.name,
      login42: pub.login42,
      avatar: pub.avatar,
      campus: pub.campus,
      posts: u.postsCount ?? 0,
      followers: u.followersCount ?? 0,
      online: isOnlineAt(beats.get(u.id)),
      following: followingSet.has(u.id),
      isMe: session?.sub === u.id,
      isSupport: pub.isSupport,
    };
  });
  return <ExploreClient users={items} />;
}
