import { NextResponse } from "next/server";
import { playMove } from "@/lib/games-store";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

// POST /api/games/[code]/move { cell } or { col }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`game-move:${session.sub}`, 60, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    cell?: number;
    col?: number;
  };
  const { room, error } = await playMove(code.toUpperCase(), session.sub, {
    cell: typeof body.cell === "number" ? body.cell : undefined,
    col: typeof body.col === "number" ? body.col : undefined,
  });
  if (error)
    return NextResponse.json({ error: "illegal move" }, { status: 409 });
  return NextResponse.json({ room });
}
