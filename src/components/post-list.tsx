"use client";

import { useCallback, useState } from "react";
import { PostCard, type FeedPost } from "@/components/post-card";
import { PostFocusModal } from "@/components/post-focus-modal";

// Feed/profile list: a comment click isolates the post + thread in a focus
// popup instead of expanding inline. The popup tracks the live feed item,
// so likes/edits stay in sync — and if the post leaves the feed (deleted),
// the popup closes with it.
export function PostList({
  posts,
  onUpdate,
  focusId,
  meName,
  meId,
  viewerIsSupport,
}: {
  posts: FeedPost[];
  onUpdate?: (id: string, patch: Partial<FeedPost>) => void;
  focusId?: string | null;
  meName?: string;
  meId?: string;
  viewerIsSupport?: boolean;
}) {
  const [popupId, setPopupId] = useState<string | null>(null);
  const openPopup = useCallback((p: FeedPost) => setPopupId(p.id), []);
  const closePopup = useCallback(() => setPopupId(null), []);
  const popup = popupId ? (posts.find((p) => p.id === popupId) ?? null) : null;

  return (
    <>
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          onUpdate={onUpdate}
          onFocusPost={openPopup}
          focused={focusId ? p.id === focusId : undefined}
          meName={meName}
          meId={meId}
          viewerIsSupport={viewerIsSupport}
        />
      ))}
      {popup && (
        <PostFocusModal
          post={popup}
          meName={meName}
          meId={meId}
          onUpdate={onUpdate}
          onClose={closePopup}
          viewerIsSupport={viewerIsSupport}
        />
      )}
    </>
  );
}
