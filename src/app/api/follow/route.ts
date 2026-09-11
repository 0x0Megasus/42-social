import { NextResponse } from "next/server";
import { updateDB, uid } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { userId } = (await req.json().catch(() => ({}))) as {
    userId?: string;
  };
  if (!userId || userId === session.sub)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const lim = rateLimit(`follow:${session.sub}`, 20, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter) } }
    );
  const following = await updateDB((db) => {
    if (!db.users.some((u) => u.id === userId)) return null;
    const i = db.follows.findIndex(
      (f) => f.followerId === session.sub && f.followingId === userId
    );
    if (i >= 0) {
      db.follows.splice(i, 1);
      return false;
    }
    db.follows.push({ followerId: session.sub, followingId: userId });
    db.notifications.unshift({
      id: uid("n"),
      userId,
      kind: "follow",
      fromId: session.sub,
      postId: null,
      read: false,
      createdAt: new Date().toISOString(),
    });
    return true;
  });
  if (following === null)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ following });
}
