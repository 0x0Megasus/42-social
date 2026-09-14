"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Avatar } from "@/components/post-card";
import { SupportBadge } from "@/components/support-badge";
import { FollowButton } from "@/components/auth-buttons";
import { MessageButton } from "@/components/message-button";
import { LiveDot } from "@/components/presence";

export type ExploreUser = {
  id: string;
  name: string;
  login42: string | null;
  avatar: string | null;
  campus: string | null;
  posts: number;
  followers: number;
  online: boolean;
  following: boolean;
  isMe: boolean;
  isSupport: boolean;
};

export function ExploreClient({ users }: { users: ExploreUser[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return users;
    return users.filter((u) =>
      [u.name, u.login42 ?? "", u.campus ?? "", `@${u.login42 ?? u.name}`]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [users, query]);

  return (
    <div className="space-y-3">
      <h1 className="px-1 text-lg font-bold tracking-tight">Explore students</h1>
      <div className="relative">
        <label htmlFor="explore-search" className="sr-only">
          Search students
        </label>
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          id="explore-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for a student.."
          autoComplete="off"
          maxLength={60}
          className="h-11 w-full rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] pl-10 pr-9 text-[14px] text-[#F4F4F5] outline-none placeholder:text-[#71717A] focus:border-[#52525B]"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {users.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-[14px] text-zinc-500 dark:border-zinc-700">
          Nobody here yet. Invite your peers.
        </p>
      )}
      {users.length > 0 && filtered.length === 0 && (
        <p
          role="status"
          className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-[14px] text-zinc-500 dark:border-zinc-700"
        >
          No students match “{q.trim()}”.
        </p>
      )}
      {filtered.map((u) => {
        const handle = u.login42 ?? u.name;
        return (
          <div
            key={u.id}
            className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <span className="relative">
              <Avatar name={u.name} src={u.avatar} />
              <LiveDot userId={u.id} initialOnline={u.online} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <Link
                  href={`/profile/${encodeURIComponent(handle)}`}
                  className="block min-w-0 truncate text-[14px] font-semibold hover:underline"
                >
                  {u.name}
                </Link>
                {u.isSupport && <SupportBadge />}
              </span>
              <p className="truncate text-xs text-zinc-500">
                @{handle}
                {u.campus ? ` · ${u.campus}` : ""} · {u.posts} posts ·{" "}
                {u.followers} followers
              </p>
            </div>
            {!u.isMe && (
              <div className="flex shrink-0 items-center gap-2">
                <FollowButton userId={u.id} initial={u.following} />
                <MessageButton userId={u.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
