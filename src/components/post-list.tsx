"use client";

import { useState } from "react";
import { PostCard, type FeedPost } from "@/components/post-card";

// Single-open accordion: at most one comments section open at a time.
export function PostList({
  posts,
  onUpdate,
  focusId,
  meName,
  meId,
}: {
  posts: FeedPost[];
  onUpdate?: (id: string, patch: Partial<FeedPost>) => void;
  focusId?: string | null;
  meName?: string;
  meId?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          onUpdate={onUpdate}
          open={p.id === openId}
          onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
          focused={focusId ? p.id === focusId : undefined}
          meName={meName}
          meId={meId}
        />
      ))}
    </>
  );
}
