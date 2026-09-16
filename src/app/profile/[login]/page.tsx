import { notFound } from "next/navigation";
import {
  cachedUserById,
  queryCollection,
  resolveUserId,
  userPublic,
} from "@/lib/db";
import { getSession } from "@/lib/session";
import { Avatar } from "@/components/post-card";
import { PostList } from "@/components/post-list";
import { FollowButton } from "@/components/auth-buttons";
import { MessageButton } from "@/components/message-button";
import { FollowCounts } from "@/components/follow-counts";
import { EditProfileForm } from "@/components/edit-profile";
import { SoundSetting } from "@/components/sound-setting";
import { LiveDot, PresenceText } from "@/components/presence";
import { FounderBadge } from "@/components/founder-badge";
import { isSupportUser } from "@/lib/support";
import { beatsFor, isOnlineAt } from "@/lib/presence";
import { followListsOf, followingIdsOf } from "@/lib/graph";
import { enrichPosts } from "@/lib/feed";
import { getRecords } from "@/lib/games-store";
import { GAME_LABEL, type GameKind } from "@/lib/games/types";
import { SpotifyPlayer } from "@/components/spotify-player";
import { MapPin, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Profile({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  const handle = decodeURIComponent(login).replace(/^@/, "");
  const session = await getSession();
  // O(1) handle resolution (login42 / name / id pointers, legacy fallback).
  const userId = await resolveUserId(handle);
  if (!userId) notFound();
  const user = await cachedUserById(userId);
  if (!user) notFound();
  const pub = userPublic(user);
  // Latest 30 posts via indexed author query + shared enrichment.
  const mine = await queryCollection("posts", {
    orderBy: "authorId",
    equalTo: user.id,
    limit: 100_000,
  }).catch(() => []);
  const live = mine
    .filter((p) => !p.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  const [posts, lists, records, meUser] = await Promise.all([
    enrichPosts(live, session?.sub ?? null),
    followListsOf(user.id),
    getRecords(user.id),
    session ? cachedUserById(session.sub) : Promise.resolve(null),
  ]);
  // Patch enriched authors to the full public profile (avatar/campus).
  for (const p of posts) p.author = { ...pub, isSupport: pub.isSupport ?? null };
  const myFollowing: string[] = session
    ? await followingIdsOf(session.sub).catch(() => [])
    : [];
  const isFollowing = myFollowing.includes(user.id);
  const isMe = session?.sub === user.id;
  const peerOnline = isOnlineAt((await beatsFor([user.id])).get(user.id));
  const played = (Object.entries(records) as [string, { w: number; l: number; d: number; best?: number }][])
    .filter(([, r]) => r.w + r.l + r.d > 0);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {pub.coverVideo ? (
          <video
            src={pub.coverVideo}
            poster={pub.cover ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden
            className="h-36 w-full object-cover sm:h-44"
          />
        ) : pub.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pub.cover}
            alt=""
            aria-hidden
            className="h-36 w-full object-cover sm:h-44"
          />
        ) : (
          <div
            aria-hidden
            className="h-24 w-full bg-gradient-to-r from-cyan-500/30 via-zinc-500/20 to-zinc-900 sm:h-28"
          />
        )}
        <div className="px-6 pb-6 text-center">
        <div className="-mt-9 flex justify-center">
          <span className="relative rounded-full ring-4 ring-white dark:ring-zinc-950">
            <Avatar name={pub.name} src={pub.avatar} size={72} />
            <LiveDot userId={user.id} initialOnline={peerOnline} size={18} />
          </span>
        </div>
        <h1 className="mt-3 flex items-center justify-center gap-2 text-xl font-bold tracking-tight">
          {pub.name}
          {pub.isSupport && <FounderBadge />}
        </h1>
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
          <FollowCounts followers={lists.followers} following={lists.following} />
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
              <EditProfileForm
                name={pub.name}
                bio={pub.bio}
                cover={pub.cover}
                spotify={pub.spotify}
              />
            </div>
            <SoundSetting />
          </>
        )}
        </div>
      </section>

      {pub.spotify && <SpotifyPlayer spotify={pub.spotify} />}

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
                  {typeof r.best === "number" && r.best > 0 && (
                    <span className="text-amber-500"> · best {r.best}</span>
                  )}
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
          posts={posts}
          meName={meUser?.name}
          meId={session?.sub}
          viewerIsSupport={isSupportUser(meUser)}
        />
      )}
    </div>
  );
}
