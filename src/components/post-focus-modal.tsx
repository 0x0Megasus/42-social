"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { PostCard, type FeedPost } from "@/components/post-card";

// Focused post popup: the post + its comments isolated from the feed so
// the reader can focus. Dismiss via X, backdrop click, or Escape.
// Likes/edits flow back through onUpdate, so the feed stays in sync.
export function PostFocusModal({
  post,
  meName,
  meId,
  onUpdate,
  onClose,
}: {
  post: FeedPost;
  meName?: string;
  meId?: string;
  onUpdate?: (id: string, patch: Partial<FeedPost>) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Post and comments"
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      <div aria-hidden onClick={onClose} className="fixed inset-0 bg-black/60" />
      <div className="relative mx-auto w-[min(42rem,calc(100vw-2rem))] py-10">
        <div className="mb-2 flex justify-end">
          <button
            onClick={onClose}
            aria-label="Close"
            autoFocus
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-lg transition-colors hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-white"
          >
            <X size={17} />
          </button>
        </div>
        <PostCard post={post} open onUpdate={onUpdate} meName={meName} meId={meId} />
      </div>
    </div>
  );
}
