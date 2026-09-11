import { NextResponse } from "next/server";
import { readDB, updateDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { touch, beatsFor, isOnlineAt } from "@/lib/presence";

// GET /api/presence?ids=a,b -> { status: { id: { online, lastSeen } } }
export async function GET(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
  const [db, beats] = await Promise.all([readDB(), beatsFor(ids)]);
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const status: Record<string, { online: boolean; lastSeen: string | null }> =
    {};
  const now = Date.now();
  for (const id of ids) {
    const u = byId.get(id);
    if (!u) continue;
    const beat = beats.get(id) ?? null;
    status[id] = {
      online: isOnlineAt(beat, now),
      lastSeen:
        beat !== null ? new Date(beat).toISOString() : (u.lastSeen ?? null),
    };
  }
  return NextResponse.json({ status });
}

// POST /api/presence -> heartbeat (called every ~20s by open tabs)
export async function POST() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date().toISOString();
  await Promise.all([
    touch(session.sub),
    updateDB((db) => {
      const u = db.users.find((x) => x.id === session.sub);
      if (u) u.lastSeen = now;
    }),
  ]);
  return NextResponse.json({ ok: true, lastSeen: now });
}
