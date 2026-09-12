import { NextResponse } from "next/server";
import { joinRoom } from "@/lib/games-store";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

// POST /api/games/[code]/join -> take the guest seat
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`game-join:${session.sub}`, 20, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const { code } = await params;
  const { room, error } = await joinRoom(code.toUpperCase(), session.sub);
  if (error === "not-found")
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (error === "full")
    return NextResponse.json({ error: "room is full" }, { status: 409 });
  return NextResponse.json({ room });
}
