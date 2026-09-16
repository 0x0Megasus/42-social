// One-off repair planner for ghost post rows.
//
// Background: before the storage-key fix, targeted writes used a compacted
// findIndex as the RTDB storage key. Once deletes left null holes behind,
// edits/recounts wrote `{body, edited, deleted, likesCount, commentsCount}`
// leaves into the wrong slot — resurrecting tombstones as partial rows with
// no id/author/createdAt. Those render as "Unknown @unknown · NaNd · Edited"
// with the victim post's engagement counts.
//
// This module is PURE (no I/O) so it is unit-tested; the thin runner that
// applies the plan against a live database is scripts/repair-ghost-posts.mjs.

export type PostsRepairPlan = {
  /** storage keys under /posts holding partial rows (no usable id) */
  ghostKeys: string[];
  /** storage keys of healthy rows (kept, for logging) */
  liveKeys: string[];
};

export function planPostsRepair(postsVal: unknown): PostsRepairPlan {
  const ghostKeys: string[] = [];
  const liveKeys: string[] = [];
  // Index loop for arrays (NOT map + destructure): RTDB can hand back
  // sparse arrays where deleted slots are holes, not nulls — .map preserves
  // holes and destructuring the resulting undefined crashes. Index access
  // reads holes as undefined, which the guard below skips.
  const visit = (key: string, v: unknown): void => {
    // Null tombstones are already dead — nothing to do.
    if (!v || typeof v !== "object") return;
    const id = (v as Record<string, unknown>).id;
    if (typeof id === "string" && id) liveKeys.push(key);
    else ghostKeys.push(key);
  };
  if (Array.isArray(postsVal)) {
    for (let i = 0; i < postsVal.length; i++) visit(String(i), postsVal[i]);
    return { ghostKeys, liveKeys };
  }
  if (postsVal && typeof postsVal === "object") {
    for (const [key, v] of Object.entries(
      postsVal as Record<string, unknown>
    )) {
      visit(key, v);
    }
  }
  return { ghostKeys, liveKeys };
}
