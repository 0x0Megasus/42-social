import { NextResponse } from "next/server";
import { leaveRoom } from "@/lib/games-store";
import { getSession } from "@/lib/session";

// POST /api/games/[code]/leave -> forfeit (winner = the other player)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { code } = await params;
  const result = await leaveRoom(code.toUpperCase(), session.sub);
  if (result.error)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (result.deleted) return NextResponse.json({ deleted: true });
  if (result.left) return NextResponse.json({ left: true });
  return NextResponse.json({ room: result.room });
}
