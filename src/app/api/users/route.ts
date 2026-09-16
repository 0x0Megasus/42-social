import { NextResponse } from "next/server";
import { isSupportUser } from "@/lib/support";
import { queryCollection, userPublic } from "@/lib/db";
import { followingIdsOf } from "@/lib/graph";
import { getSession } from "@/lib/session";
import { ensureCountersBackfilled } from "@/lib/counters";
import { after } from "next/server";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const term = (q.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  const limit = Math.min(Math.max(Number(q.get("limit")) || 50, 1), 100);
  after(() => ensureCountersBackfilled());
  const rows = term
    ? await queryCollection("users", {
        orderBy: "nameLower",
        startAt: term,
        endAt: `${term}\uf8ff`,
        first: limit,
      }).catch(() => [])
    : await queryCollection("users", {
        orderBy: "createdAt",
        limit,
      }).catch(() => []);
  const matched = term
    ? rows.filter((u) => (u.nameLower ?? u.name.toLowerCase()).startsWith(term))
    : [...rows].reverse();
  const following = new Set(
    await followingIdsOf(session.sub).catch(() => [])
  );
  return NextResponse.json(
    {
      users: matched.map((u) => {
        const pub = userPublic(u);
        return {
          id: u.id,
          name: pub.name,
          login42: pub.login42,
          avatar: pub.avatar,
          campus: pub.campus,
          posts: u.postsCount ?? 0,
          followers: u.followersCount ?? 0,
          online: false,
          following: following.has(u.id),
          isMe: session.sub === u.id,
          isSupport: isSupportUser(u),
        };
      }),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
