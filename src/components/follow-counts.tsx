"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, X } from "lucide-react";
import { Avatar } from "@/components/post-card";

export type FollowUser = {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
};

type Tab = "followers" | "following";

// Clickable followers/following counts that open a modal with the user list.
export function FollowCounts({
  followers,
  following,
}: {
  followers: FollowUser[];
  following: FollowUser[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("followers");

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const list = tab === "followers" ? followers : following;

  return (
    <>
      <span className="flex items-center gap-1">
        <Users size={13} aria-hidden />
        <button
          onClick={() => {
            setTab("followers");
            setOpen(true);
          }}
          className="font-medium tabular-nums hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
        >
          {followers.length} followers
        </button>
        <span aria-hidden>·</span>
        <button
          onClick={() => {
            setTab("following");
            setOpen(true);
          }}
          className="font-medium tabular-nums hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
        >
          {following.length} following
        </button>
      </span>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${tab === "followers" ? "Followers" : "Following"}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[70dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div
                role="tablist"
                aria-label="Follow lists"
                className="flex gap-1"
              >
                {(
                  [
                    ["followers", "Followers"],
                    ["following", "Following"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={
                      tab === id
                        ? "rounded-full bg-zinc-900 px-3 py-1 text-[13px] font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900"
                        : "rounded-full px-3 py-1 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {list.length === 0 ? (
                <p className="p-8 text-center text-[14px] text-zinc-500">
                  {tab === "followers"
                    ? "No followers yet."
                    : "Not following anyone yet."}
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {list.map((u) => (
                    <li key={u.id}>
                      <Link
                        href={`/profile/${encodeURIComponent(u.handle)}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        <Avatar name={u.name} src={u.avatar} size={32} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold">
                            {u.name}
                          </span>
                          <span className="block truncate text-xs text-zinc-500">
                            @{u.handle}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
