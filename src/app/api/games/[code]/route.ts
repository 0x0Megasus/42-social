import { NextResponse } from "next/server";
import { viewRoom } from "@/lib/games-store";
import { getSession } from "@/lib/session";

// GET /api/games/[code] -> room view (players + spectators)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { code } = await params;
  const room = await viewRoom(code.toUpperCase(), session.sub);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ room });
}
