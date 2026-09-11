import Link from "next/link";
import { readDB, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { Avatar } from "@/components/post-card";
import { FollowButton } from "@/components/auth-buttons";
import { MessageButton } from "@/components/message-button";
import { LiveDot } from "@/components/presence";
import { beatsFor, isOnlineAt } from "@/lib/presence";

export const dynamic = "force-dynamic";

export default async function Explore() {
  const [db, session] = await Promise.all([readDB(), getSession()]);
  const users = db.users.slice(-30).reverse();
  const beats = await beatsFor(users.map((u) => u.id));
  const onlineOf = (id: string) => isOnlineAt(beats.get(id));
  const following = new Set(
    db.follows.filter((f) => f.followerId === session?.sub).map((f) => f.followingId)
  );

  return (
    <div className="space-y-3">
      <h1 className="px-1 text-lg font-bold tracking-tight">Explore students</h1>
      {users.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-[14px] text-zinc-500 dark:border-zinc-700">
          Nobody here yet. Invite your peers.
        </p>
      )}
      {users.map((u) => {
        const pub = userPublic(u);
        const handle = pub.login42 ?? pub.name;
        const counts = {
          posts: db.posts.filter((p) => p.authorId === u.id).length,
          followers: db.follows.filter((f) => f.followingId === u.id).length,
        };
        return (
          <div
            key={u.id}
            className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <span className="relative">
              <Avatar name={pub.name} src={pub.avatar} />
              <LiveDot userId={u.id} initialOnline={onlineOf(u.id)} />
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/profile/${handle}`}
                className="block truncate text-[14px] font-semibold hover:underline"
              >
                {pub.name}
              </Link>
              <p className="truncate text-xs text-zinc-500">
                @{handle}
                {pub.campus ? ` · ${pub.campus}` : ""} · {counts.posts} posts ·{" "}
                {counts.followers} followers
              </p>
            </div>
            {session && session.sub !== u.id && (
              <div className="flex shrink-0 items-center gap-2">
                <FollowButton userId={u.id} initial={following.has(u.id)} />
                <MessageButton userId={u.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
