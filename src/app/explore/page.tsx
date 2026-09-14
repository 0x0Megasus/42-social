import { readDB, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { beatsFor, isOnlineAt } from "@/lib/presence";
import { ExploreClient } from "@/components/explore-client";

export const dynamic = "force-dynamic";

export default async function Explore() {
  const [db, session] = await Promise.all([readDB(), getSession()]);
  const users = db.users.slice(-30).reverse();
  const beats = await beatsFor(users.map((u) => u.id));
  const following = new Set(
    db.follows.filter((f) => f.followerId === session?.sub).map((f) => f.followingId)
  );
  const items = users.map((u) => {
    const pub = userPublic(u);
    return {
      id: u.id,
      name: pub.name,
      login42: pub.login42,
      avatar: pub.avatar,
      campus: pub.campus,
      posts: db.posts.filter((p) => p.authorId === u.id && !p.deleted).length,
      followers: db.follows.filter((f) => f.followingId === u.id).length,
      online: isOnlineAt(beats.get(u.id)),
      following: following.has(u.id),
      isMe: session?.sub === u.id,
      isSupport: pub.isSupport,
    };
  });
  return <ExploreClient users={items} />;
}
