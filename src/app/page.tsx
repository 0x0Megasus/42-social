import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readDB, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rankFeed } from "@/lib/feed-rank";
import { Feed } from "@/components/feed";
import { Footer } from "@/components/footer";

export const dynamic = "force-dynamic";

// Gated by middleware — session is guaranteed here.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const [db, session] = await Promise.all([readDB(), getSession()]);
  if (!session) redirect("/login");
  const { sort } = await searchParams;
  const initialSort = sort === "new" ? "new" : "top";
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const meUser = byId.get(session.sub);
  const me = meUser ? userPublic(meUser) : null;
  const likeCount = new Map<string, number>();
  for (const l of db.likes) likeCount.set(l.postId, (likeCount.get(l.postId) ?? 0) + 1);
  const commentCount = new Map<string, number>();
  for (const c of db.comments)
    if (!c.deleted) commentCount.set(c.postId, (commentCount.get(c.postId) ?? 0) + 1);
  const followingIds = db.follows
    .filter((f) => f.followerId === session.sub)
    .map((f) => f.followingId);
  const enriched = [...db.posts]
    .filter((p) => !p.deleted)
    .map((p) => ({
      ...p,
      author: byId.get(p.authorId) ? userPublic(byId.get(p.authorId)!) : null,
      likes: likeCount.get(p.id) ?? 0,
      comments: commentCount.get(p.id) ?? 0,
      liked: db.likes.some((l) => l.postId === p.id && l.userId === session.sub),
    }));
  const ordered =
    initialSort === "new"
      ? enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : rankFeed(enriched, session.sub, followingIds);
  const posts = ordered.slice(0, 50);

  return (
    <div className="space-y-4">
      <Suspense>
        <Feed initial={posts} me={me} initialSort={initialSort} />
      </Suspense>
      <Footer />
    </div>
  );
}
