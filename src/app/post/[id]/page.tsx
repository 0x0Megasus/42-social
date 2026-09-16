import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  cachedUserById,
  queryCollection,
  readPath,
  readPostById,
  userPublic,
} from "@/lib/db";
import { isSupportUser } from "@/lib/support";
import { enrichComments } from "@/lib/feed";
import { getSession } from "@/lib/session";
import { PostCard } from "@/components/post-card";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const p = await readPostById(id);
  if (!p || p.deleted) notFound();
  const [likeMap, myLike, commentRows, meUser] = await Promise.all([
    readPath<Record<string, true>>(`/likes-by-post/${id}`).catch(() => null),
    readPath<unknown>(`/likes-by-post/${id}/${session.sub}`).catch(
      () => null
    ),
    queryCollection("comments", {
      orderBy: "postId",
      equalTo: id,
      limit: 100_000,
    }).catch(() => []),
    cachedUserById(session.sub),
  ]);
  let likes =
    likeMap && typeof likeMap === "object"
      ? Object.values(likeMap).filter(Boolean).length
      : 0;
  let liked = myLike != null;
  const legacyLikes = await queryCollection("likes", {
    orderBy: "postId",
    equalTo: id,
    limit: 100_000,
  }).catch(() => []);
  for (const l of legacyLikes) {
    if (!(likeMap && (likeMap as Record<string, unknown>)[l.userId])) {
      likes++;
      if (l.userId === session.sub) liked = true;
    }
  }
  const comments = commentRows.filter((c) => !c.deleted).length;
  const me = meUser ? userPublic(meUser) : null;
  const post = {
    ...p,
    author: p.author ?? null,
    likes: Math.max(p.likesCount ?? 0, likes),
    comments: p.commentsCount ?? comments,
    liked,
  };
  const initialComments = await enrichComments(
    [...commentRows]
      .filter((c) => !c.deleted)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  );
  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-[#E4E4E7] dark:hover:text-zinc-100">
        <ArrowLeft size={16} /> Back to feed
      </Link>
      <PostCard post={post} meName={me?.name} meId={me?.id} open initialComments={initialComments} viewerIsSupport={isSupportUser(meUser)} />
    </div>
  );
}
