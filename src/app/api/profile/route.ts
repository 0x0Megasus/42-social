import { NextResponse } from "next/server";
import { updateDB, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";

// PATCH /api/profile { name, bio } — edit your own nickname + bio.
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`prof:${session.sub}`, 10, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter) } }
    );
  const { name, bio } = (await req.json().catch(() => ({}))) as {
    name?: string;
    bio?: string;
  };
  const cleanName = clean(name, 30);
  const cleanBio = clean(bio, 160);
  if (cleanName.length < 2)
    return NextResponse.json(
      { error: "Name needs at least 2 characters." },
      { status: 400 }
    );
  const user = await updateDB((db) => {
    const u = db.users.find((x) => x.id === session.sub);
    if (!u) return null;
    u.name = cleanName;
    u.bio = cleanBio;
    return userPublic(u);
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ user });
}
