import { NextResponse } from "next/server";
import { rematch } from "@/lib/games-store";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

// POST /api/games/[code]/rematch -> ready up; both ready starts a new round
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`game-rematch:${session.sub}`, 20, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const { code } = await params;
  const { room, error } = await rematch(code.toUpperCase(), session.sub);
  if (error)
    return NextResponse.json({ error: "not ready" }, { status: 409 });
  return NextResponse.json({ room });
}
