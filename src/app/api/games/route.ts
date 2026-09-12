import { NextResponse } from "next/server";
import { createRoom } from "@/lib/games-store";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import type { GameKind } from "@/lib/games/types";

const KINDS: GameKind[] = ["tictactoe", "connectfour"];

// POST /api/games { kind } -> { room }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`game-create:${session.sub}`, 10, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const { kind } = (await req.json().catch(() => ({}))) as {
    kind?: string;
  };
  if (!KINDS.includes(kind as GameKind))
    return NextResponse.json({ error: "invalid game" }, { status: 400 });
  try {
    const room = await createRoom(kind as GameKind, session.sub);
    return NextResponse.json({ room }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
