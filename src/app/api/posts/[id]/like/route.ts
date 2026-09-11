import { NextResponse } from "next/server";
import { updateDB, uid } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`like:${session.sub}`, 30, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter) } }
    );
  const { id } = await params;
  const result = await updateDB((db) => {
    const post = db.posts.find((p) => p.id === id);
    if (!post) return null;
    const i = db.likes.findIndex(
      (l) => l.postId === id && l.userId === session.sub
    );
    let liked: boolean;
    if (i >= 0) {
      db.likes.splice(i, 1);
      liked = false;
    } else {
      db.likes.push({ postId: id, userId: session.sub });
      liked = true;
      if (post.authorId !== session.sub) {
        db.notifications.unshift({
          id: uid("n"),
          userId: post.authorId,
          kind: "like",
          fromId: session.sub,
          postId: id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return {
      liked,
      likes: db.likes.filter((l) => l.postId === id).length,
    };
  });
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}
