import { NextResponse } from "next/server";
import { flagRoom } from "@/lib/games-store";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

// POST /api/games/[code]/flag -> claim a win on time (chess clock hit 0)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`game-flag:${session.sub}`, 30, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const { code } = await params;
  const { room, error } = await flagRoom(code.toUpperCase(), session.sub);
  if (error === "not found")
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (error) return NextResponse.json({ error }, { status: 409 });
  return NextResponse.json({ room });
}
