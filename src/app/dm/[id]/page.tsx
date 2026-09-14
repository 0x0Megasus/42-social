import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { readDB, userPublic } from "@/lib/db";
import { Avatar } from "@/components/post-card";
import { DmThread } from "@/components/dm-thread";
import { LiveDot, PresenceText } from "@/components/presence";
import { beatsFor, isOnlineAt } from "@/lib/presence";

export const dynamic = "force-dynamic";

export default async function DmChat({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = await readDB();
  const convo = db.conversations.find((c) => c.id === id);
  if (!convo || (convo.aId !== session.sub && convo.bId !== session.sub)) {
    redirect("/dm");
  }
  const peerId = convo.aId === session.sub ? convo.bId : convo.aId;
  const peer = db.users.find((u) => u.id === peerId);
  const me = db.users.find((u) => u.id === session.sub);
  const pub = peer ? userPublic(peer) : null;
  const handle = pub?.login42 ?? pub?.name ?? "?";
  const peerOnline = peer
    ? isOnlineAt((await beatsFor([peer.id])).get(peer.id))
    : false;

  return (
    // Break out of the global max-w-xl shell so the chat gets real room.
    <div className="relative left-1/2 flex h-[calc(100dvh-10rem)] min-h-[20rem] w-[min(56rem,calc(100vw-2rem))] max-w-none -translate-x-1/2 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 px-1 pb-3">
        <Link
          href="/dm"
          aria-label="Back to messages"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <ArrowLeft size={18} />
        </Link>
        <span className="relative">
          <Avatar name={pub?.name ?? "?"} src={pub?.avatar ?? null} size={36} />
          {peer && (
            <LiveDot
              userId={peer.id}
              initialOnline={peerOnline}
              size={11}
            />
          )}
        </span>
        <div className="min-w-0">
          <Link
            href={`/profile/${handle}`}
            className="block truncate text-[15px] font-bold hover:underline"
          >
            {pub?.name ?? "Unknown"}
          </Link>
          <p className="truncate text-xs text-zinc-500">
            {peer ? (
              <PresenceText
                userId={peer.id}
                initial={{
                  online: peerOnline,
                  lastSeen: pub?.lastSeen ?? null,
                }}
              />
            ) : (
              `@${handle}`
            )}
          </p>
        </div>
      </div>
      <DmThread
        convoId={id}
        peerName={pub?.name ?? "Unknown"}
        peerId={peer?.id ?? ""}
        myId={session.sub}
        peerAvatar={pub?.avatar ?? null}
        myName={me?.name ?? "You"}
        myAvatar={me?.avatar ?? null}
      />
    </div>
  );
}
