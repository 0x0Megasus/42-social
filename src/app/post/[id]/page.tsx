import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { readDB, userPublic } from "@/lib/db";
import { isSupportUser } from "@/lib/support";
import { getSession } from "@/lib/session";
import { PostCard } from "@/components/post-card";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const db = await readDB();
  const p = db.posts.find((x) => x.id === id && !x.deleted);
  if (!p) notFound();
  const author = db.users.find((u) => u.id === p.authorId);
  const likes = db.likes.filter((l) => l.postId === id).length;
  const comments = db.comments.filter((c) => c.postId === id && !c.deleted).length;
  const liked = db.likes.some((l) => l.postId === id && l.userId === session.sub);
  const meUser = db.users.find((u) => u.id === session.sub);
  const me = meUser ? userPublic(meUser) : null;
  const post = { ...p, author: author ? userPublic(author) : null, likes, comments, liked };
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const initialComments = db.comments
    .filter((c) => c.postId === id && !c.deleted)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => {
      const a = byId.get(c.authorId);
      return {
        ...c,
        author: a
          ? {
              id: a.id,
              name: a.name,
              login42: a.login42,
              avatar: a.avatar ?? null,
              isSupport: isSupportUser(a),
            }
          : null,
      };
    });
  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-[#E4E4E7] dark:hover:text-zinc-100">
        <ArrowLeft size={16} /> Back to feed
      </Link>
      <PostCard post={post} meName={me?.name} meId={me?.id} open initialComments={initialComments} viewerIsSupport={isSupportUser(meUser)} />
    </div>
  );
}
