import { NextResponse } from "next/server";
import { createRoom } from "@/lib/games-store";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import type { GameKind } from "@/lib/games/types";

// Offered in the lobby. "number" + "twentyone" are retired: existing rooms
// stay playable, but no new rooms can be created for them.
const KINDS: GameKind[] = [
  "tictactoe",
  "connectfour",
  "rps",
  "chess",
  "backrooms",
];

// POST /api/games { kind, vsBot?, mode? } -> { room }
// Backrooms takes mode: "solo" | "duel" instead of vsBot (no bot for FPS).
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
  const { kind, vsBot, mode } = (await req.json().catch(() => ({}))) as {
    kind?: string;
    vsBot?: boolean;
    mode?: string;
  };
  if (!KINDS.includes(kind as GameKind))
    return NextResponse.json({ error: "invalid game" }, { status: 400 });
  if (kind === "backrooms" && vsBot === true)
    return NextResponse.json({ error: "no bot for backrooms" }, { status: 400 });
  if (
    kind === "backrooms" &&
    mode !== undefined &&
    mode !== "solo" &&
    mode !== "duel"
  )
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  try {
    const room = await createRoom(kind as GameKind, session.sub, {
      vsBot: vsBot === true,
      ...(kind === "backrooms"
        ? { mode: mode === "duel" ? ("duel" as const) : ("solo" as const) }
        : {}),
    });
    return NextResponse.json({ room }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
