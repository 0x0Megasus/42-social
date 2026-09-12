import { notFound } from "next/navigation";
import { readDB, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { Avatar } from "@/components/post-card";
import { PostList } from "@/components/post-list";
import { FollowButton } from "@/components/auth-buttons";
import { MessageButton } from "@/components/message-button";
import { EditProfileForm } from "@/components/edit-profile";
import { SoundSetting } from "@/components/sound-setting";
import { LiveDot, PresenceText } from "@/components/presence";
import { beatsFor, isOnlineAt } from "@/lib/presence";
import { getRecords } from "@/lib/games-store";
import { GAME_LABEL, type GameKind } from "@/lib/games/types";
import { MapPin, Users, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Profile({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  const handle = decodeURIComponent(login).replace(/^@/, "");
  const [db, session] = await Promise.all([readDB(), getSession()]);
  const user = db.users.find(
    (u) =>
      u.login42?.toLowerCase() === handle.toLowerCase() ||
      u.name.toLowerCase() === handle.toLowerCase() ||
      u.id === handle
  );
  if (!user) notFound();
  const pub = userPublic(user);
  const posts = db.posts
    .filter((p) => p.authorId === user.id && !p.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => ({
      ...p,
      author: pub,
      likes: db.likes.filter((l) => l.postId === p.id).length,
      comments: db.comments.filter((c) => c.postId === p.id && !c.deleted)
        .length,
      liked: session
        ? db.likes.some((l) => l.postId === p.id && l.userId === session.sub)
        : false,
    }));
  const followers = db.follows.filter((f) => f.followingId === user.id).length;
  const following = db.follows.filter((f) => f.followerId === user.id).length;
  const isFollowing = session
    ? db.follows.some(
        (f) => f.followerId === session.sub && f.followingId === user.id
      )
    : false;
  const isMe = session?.sub === user.id;
  const peerOnline = isOnlineAt((await beatsFor([user.id])).get(user.id));
  const records = await getRecords(user.id);
  const played = (Object.entries(records) as [string, { w: number; l: number; d: number }][])
    .filter(([, r]) => r.w + r.l + r.d > 0);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex justify-center">
          <span className="relative">
            <Avatar name={pub.name} src={pub.avatar} size={72} />
            <LiveDot userId={user.id} initialOnline={peerOnline} size={18} />
          </span>
        </div>
        <h1 className="mt-3 text-xl font-bold tracking-tight">{pub.name}</h1>
        <p className="text-[14px] text-zinc-500">
          @{pub.login42 ?? pub.name}
          {pub.coalition ? ` · ${pub.coalition}` : ""}
          {!isMe && (
            <>
              {" · "}
              <PresenceText
                userId={user.id}
                initial={{
                  online: peerOnline,
                  lastSeen: pub.lastSeen ?? null,
                }}
              />
            </>
          )}
        </p>
        <div className="mt-2 flex items-center justify-center gap-4 text-[13px] text-zinc-500">
          {pub.campus && (
            <span className="flex items-center gap-1">
              <MapPin size={13} /> {pub.campus}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users size={13} /> {followers} followers · {following} following
          </span>
        </div>
        {pub.bio && (
          <p className="mx-auto mt-3 max-w-sm break-words text-[14px] leading-6">{pub.bio}</p>
        )}
        {!isMe && session && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <FollowButton userId={user.id} initial={isFollowing} />
            <MessageButton userId={user.id} />
          </div>
        )}
        {isMe && (
          <>
            <div className="flex justify-center">
              <EditProfileForm name={pub.name} bio={pub.bio} />
            </div>
            <SoundSetting />
          </>
        )}
      </section>

      {played.length > 0 && (
        <section
          aria-label="Game records"
          className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <h2 className="flex items-center gap-1.5 px-1 pb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-400">
            <Trophy size={13} /> Arcade
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {played.map(([kind, r]) => (
              <div
                key={kind}
                className="rounded-xl bg-zinc-50 px-3 py-2 text-center dark:bg-zinc-900"
              >
                <p className="text-[13px] font-semibold">
                  {GAME_LABEL[kind as GameKind] ?? kind}
                </p>
                <p className="text-xs tabular-nums text-zinc-500">
                  {r.w}W · {r.l}L · {r.d}D
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-[14px] text-zinc-500 dark:border-zinc-700">
          No posts yet.
        </p>
      ) : (
        <PostList
          posts={posts.map((p) => ({
            ...p,
            author: { ...pub, campus: pub.campus },
          }))}
          meName={
            session
              ? db.users.find((u) => u.id === session.sub)?.name ?? undefined
              : undefined
          }
          meId={session?.sub}
        />
      )}
    </div>
  );
}
