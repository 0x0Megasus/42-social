import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readDB, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { Feed } from "@/components/feed";

export const dynamic = "force-dynamic";

// Gated by middleware — session is guaranteed here.
export default async function Home() {
  const [db, session] = await Promise.all([readDB(), getSession()]);
  if (!session) redirect("/login");
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const meUser = byId.get(session.sub);
  const me = meUser ? userPublic(meUser) : null;
  const posts = [...db.posts]
    .filter((p) => !p.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map((p) => ({
      ...p,
      author: byId.get(p.authorId) ? userPublic(byId.get(p.authorId)!) : null,
      likes: db.likes.filter((l) => l.postId === p.id).length,
      comments: db.comments.filter((c) => c.postId === p.id && !c.deleted)
        .length,
      liked: db.likes.some((l) => l.postId === p.id && l.userId === session.sub),
    }));

  return (
    <div className="space-y-4">
      <Suspense>
        <Feed initial={posts} me={me} />
      </Suspense>
    </div>
  );
}
