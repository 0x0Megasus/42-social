"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/post-card";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NotifItem = {
  id: string;
  kind: "like" | "comment" | "follow";
  postId: string | null;
  read: boolean;
  createdAt: string;
  fromId: string;
  from: {
    id: string;
    name: string;
    login42: string | null;
    avatar: string | null;
  } | null;
};

const LABEL: Record<string, string> = {
  like: "liked your post",
  comment: "commented on your post",
  follow: "followed you",
};

export function NotificationItem({ n }: { n: NotifItem }) {
  const router = useRouter();
  const handle = n.from?.login42 ?? n.from?.name ?? null;
  // Container goes to the post (or the follower's profile for follows).
  const target = n.postId
    ? `/?focus=${n.postId}`
    : handle
      ? `/profile/${encodeURIComponent(handle)}`
      : null;

  return (
    <div
      role={target ? "link" : undefined}
      tabIndex={target ? 0 : undefined}
      aria-label={target ? `Open ${n.kind}` : undefined}
      onClick={() => target && router.push(target)}
      onKeyDown={(e) => {
        if (target && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          router.push(target);
        }
      }}
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3",
        n.read
          ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          : "border-cyan-200 bg-cyan-50/60 dark:border-cyan-900 dark:bg-cyan-950/20",
        target && "cursor-pointer transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
      )}
    >
      <Avatar
        name={n.from?.name ?? "?"}
        src={n.from?.avatar ?? null}
        size={36}
      />
      <p className="min-w-0 flex-1 text-[14px]">
        {handle && n.from ? (
          <Link
            href={`/profile/${encodeURIComponent(handle)}`}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold hover:underline"
          >
            {n.from.name}
          </Link>
        ) : (
          <span className="font-semibold">{n.from?.name ?? "Someone"}</span>
        )}{" "}
        <span className="text-zinc-500">{LABEL[n.kind]}</span>
        <span className="block text-xs text-zinc-400">
          {timeAgo(n.createdAt)}
        </span>
      </p>
      {!n.read && (
        <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-500" />
      )}
    </div>
  );
}
