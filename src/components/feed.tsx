"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Composer } from "@/components/composer";
import { PostList } from "@/components/post-list";
import { api } from "@/lib/api";
import type { FeedPost } from "@/components/post-card";

export type FeedAuthor = NonNullable<FeedPost["author"]>;

// Client feed: instant optimistic inserts + live counts (poll + focus refresh).
export function Feed({
  initial,
  me,
  initialSort = "top",
}: {
  initial: FeedPost[];
  me: FeedAuthor | null;
  initialSort?: "top" | "new";
}) {
  const [posts, setPosts] = useState<FeedPost[]>(initial);
  const [sort, setSort] = useState<"top" | "new">(initialSort);
  const sortRef = useRef(sort);
  sortRef.current = sort;
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusId = searchParams.get("focus");
  const warnedFocus = useRef<string | null>(null);

  // Notification deep-link target is gone (deleted) — say so, don't strand
  // the user on a highlight that will never appear.
  useEffect(() => {
    if (!focusId || warnedFocus.current === focusId) return;
    if (!posts.some((p) => p.id === focusId)) {
      warnedFocus.current = focusId;
      toast.info("That post is no longer available — it may have been deleted.");
      router.replace("/");
    }
  }, [focusId, posts, router]);

  const update = useCallback(
    (id: string, patch: Partial<FeedPost>) =>
      setPosts((ps) =>
        patch.deleted
          ? ps.filter((p) => p.id !== id)
          : ps.map((p) => (p.id === id ? { ...p, ...patch } : p))
      ),
    []
  );

  const refresh = useCallback(async (mode?: "top" | "new") => {
    // Timeout-guarded via api() (skill: react-best-practices): polling can
    // never stick a spinner forever; failures keep the current feed.
    try {
      const s = mode ?? sortRef.current;
      const res = await api(`/api/posts?sort=${s}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.posts)) setPosts(d.posts);
    } catch {
      /* offline/timeout: keep current feed */
    }
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 10000);
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  function prepend(post: FeedPost) {
    setPosts((ps) => {
      if (ps.some((p) => p.id === post.id)) return ps;
      return [post, ...ps];
    });
  }

  function switchSort(mode: "top" | "new") {
    if (mode === sort) return;
    setSort(mode);
    void refresh(mode);
  }

  return (
    <div className="space-y-4">
      {me && <Composer author={me} onPosted={prepend} />}
      <div className="flex items-center gap-1 px-1" role="tablist" aria-label="Feed order">
        {(["top", "new"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={sort === m}
            onClick={() => switchSort(m)}
            className={
              sort === m
                ? "rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "rounded-full px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }
          >
            {m === "top" ? "Top" : "New"}
          </button>
        ))}
      </div>
      {posts.length === 0 ? (
        <div
          role="status"
          className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700"
        >
          <p className="text-[15px] font-semibold">Quiet campus…</p>
          <p className="mt-1 text-[13px] text-zinc-500">
            Be the first to post something.
          </p>
        </div>
      ) : (
        <PostList
          posts={posts}
          onUpdate={update}
          focusId={focusId}
          meName={me?.name}
          meId={me?.id}
        />
      )}
    </div>
  );
}
