"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Composer } from "@/components/composer";
import { PostList } from "@/components/post-list";
import { api } from "@/lib/api";
import type { FeedPost } from "@/components/post-card";

export type FeedAuthor = NonNullable<FeedPost["author"]>;

export function Feed({
  initial,
  initialHasMore,
  me,
}: {
  initial: FeedPost[];
  initialHasMore: boolean;
  me: FeedAuthor | null;
}) {
  const [posts, setPosts] = useState<FeedPost[]>(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusId = searchParams.get("focus");
  const warnedFocus = useRef<string | null>(null);

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

  const refresh = useCallback(async () => {
    try {
      const res = await api("/api/posts", { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.posts)) {
        setPosts(d.posts);
        setHasMore(d.hasMore === true);
      }
    } catch {
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api(`/api/posts?offset=${posts.length}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.posts)) {
        setPosts((ps) => {
          const seen = new Set(ps.map((p) => p.id));
          const fresh = (d.posts as FeedPost[]).filter((p) => !seen.has(p.id));
          return [...ps, ...fresh];
        });
        setHasMore(d.hasMore === true);
      }
    } catch {
      toast.error("Couldn't load more posts.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, posts.length]);

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

  return (
    <div className="space-y-4">
      {me && <Composer author={me} onPosted={prepend} />}
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
        <>
          <PostList
            posts={posts}
            onUpdate={update}
            focusId={focusId}
            meName={me?.name}
            meId={me?.id}
            viewerIsSupport={me?.isSupport ?? false}
          />
          {hasMore && (
            <button
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 text-[13px] font-semibold text-zinc-600 transition-colors hover:border-zinc-300 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
