import { NextResponse } from "next/server";
import { submitResult } from "@/lib/games-store";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`game-submit:${session.sub}`, 20, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    score?: number;
    kills?: number;
    wave?: number;
    time?: number;
    won?: boolean;
  };
  const { room, error } = await submitResult(code.toUpperCase(), session.sub, {
    score: body.score,
    kills: body.kills,
    wave: body.wave,
    time: body.time,
    won: body.won,
  });
  if (error)
    return NextResponse.json({ error: "not ready" }, { status: 409 });
  return NextResponse.json({ room });
}
