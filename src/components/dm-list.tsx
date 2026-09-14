"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Avatar } from "@/components/post-card";
import { DmRowSkeleton } from "@/components/skeletons";
import { timeAgo } from "@/lib/format";
import { stripMarkup } from "@/components/rich-text";
import { MessageButton } from "@/components/message-button";
import { LiveDot } from "@/components/presence";
import { cn } from "@/lib/utils";

type Peer = {
  id: string;
  name: string;
  login42: string | null;
  avatar: string | null;
  campus: string | null;
  lastSeen: string | null;
};

type Convo = {
  id: string;
  peer: Peer | null;
  last: {
    body: string;
    kind: string;
    mine: boolean;
    senderId?: string;
    createdAt: string;
  } | null;
  unread: number;
};

// Live inbox: polls so new messages + previews appear without navigation.
export function DmList({ meId }: { meId: string }) {
  const router = useRouter();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [users, setUsers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dm", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.conversations)) setConvos(d.conversations);
    } catch {
      /* offline: keep current list */
    }
  }, [router]);

  useEffect(() => {
    Promise.all([
      load().finally(() => setLoading(false)),
      fetch("/api/users")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && Array.isArray(d.users) && setUsers(d.users))
        .catch(() => null),
    ]);
    const t = setInterval(load, 3000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const inConvo = new Set(convos.map((c) => c.peer?.id));
  const strangers = users.filter((u) => u.id !== meId && !inConvo.has(u.id));

  return (
    <div className="space-y-3">
      <h1 className="px-1 text-lg font-bold tracking-tight">Messages</h1>
      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading messages">
          <DmRowSkeleton count={1} />
        </div>
      ) : (
        <>
          {convos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
              <MessageCircle
                size={28}
                className="mx-auto text-zinc-300 dark:text-zinc-600"
              />
              <p className="mt-2 text-[15px] font-semibold">No conversations</p>
              <p className="mt-1 text-[13px] text-zinc-500">
                Pick someone below to start chatting.
              </p>
            </div>
          )}
          {convos.map((c) => (
            <Link
              key={c.id}
              href={`/dm/${c.id}`}
              className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <span className="relative">
                <Avatar name={c.peer?.name ?? "?"} src={c.peer?.avatar ?? null} />
                {c.peer && (
                  <LiveDot userId={c.peer.id} initialOnline={null} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">
                  {c.peer?.name ?? "Unknown"}
                </p>
                <p
                  className={cn(
                    "truncate text-[13px]",
                    c.unread > 0
                      ? "font-semibold text-zinc-900 dark:text-zinc-50"
                      : "text-zinc-500"
                  )}
                >
                  {c.last
                    ? `${c.last.mine ? "You: " : ""}${
                        c.last.kind === "sticker"
                          ? " sent a sticker"
                          : stripMarkup(c.last.body)
                      }`
                    : "Start chatting"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {c.last && (
                  <span className="text-[11px] text-zinc-400">
                    {timeAgo(c.last.createdAt)}
                  </span>
                )}
                {c.unread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-[11px] font-bold text-white">
                    {c.unread}
                  </span>
                )}
              </div>
            </Link>
          ))}
          {strangers.length > 0 && (
            <section aria-label="Start a new chat" className="pt-2">
              <h2 className="px-1 pb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-400">
                New chat
              </h2>
              <div className="space-y-2">
                {strangers.slice(0, 20).map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <span className="relative">
                      <Avatar name={u.name} src={u.avatar} size={36} />
                      <LiveDot userId={u.id} initialOnline={null} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">
                        {u.name}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        @{u.login42 ?? u.name}
                      </p>
                    </div>
                    <MessageButton userId={u.id} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
