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
    pick?: string;
    guess?: number;
    action?: string;
    from?: string;
    to?: string;
    promotion?: string;
  };
  const { room, error } = await playMove(code.toUpperCase(), session.sub, {
    cell: typeof body.cell === "number" ? body.cell : undefined,
    col: typeof body.col === "number" ? body.col : undefined,
    pick: typeof body.pick === "string" ? body.pick : undefined,
    guess: typeof body.guess === "number" ? body.guess : undefined,
    action: typeof body.action === "string" ? body.action : undefined,
    from: typeof body.from === "string" ? body.from : undefined,
    to: typeof body.to === "string" ? body.to : undefined,
    promotion: typeof body.promotion === "string" ? body.promotion : undefined,
  });
  if (error)
    return NextResponse.json({ error: "illegal move" }, { status: 409 });
  return NextResponse.json({ room });
}
