"use client";

import { useCallback, useState } from "react";
import { PostCard, type FeedPost } from "@/components/post-card";
import { PostFocusModal } from "@/components/post-focus-modal";

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
          suspended={popupId !== null}
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
