import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { touch, beatsFor, isOnlineAt } from "@/lib/presence";
import { getRtdb, rtdb } from "@/lib/fbrdb";

type UserRow = { id?: string; lastSeen?: string | null };

// Scoped read: /users only (never the whole root — root includes posts,
// messages, games… and times out -> 500). Handles array or object shapes.
async function lastSeenFor(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const snap = await rtdb("users.get", () => getRtdb().ref("/users").get());
  const raw = snap.val() as unknown;
  const rows: UserRow[] = Array.isArray(raw)
    ? (raw as UserRow[])
    : raw && typeof raw === "object"
      ? Object.values(raw as Record<string, UserRow>)
      : [];
  const byId = new Map<string, UserRow>();
  for (const u of rows) {
    if (u && typeof u.id === "string") byId.set(u.id, u);
  }
  for (const id of ids) out.set(id, byId.get(id)?.lastSeen ?? null);
  return out;
}

// Best-effort leaf write: /users/{index}/lastSeen (no root transaction,
// so heartbeats never contend with the feed/games and never 500 the tab).
async function touchLastSeen(userId: string, iso: string): Promise<void> {
  const snap = await rtdb("users.idx", () => getRtdb().ref("/users").get());
  const raw = snap.val() as unknown;
  let idx = -1;
  if (Array.isArray(raw)) {
    idx = (raw as UserRow[]).findIndex((u) => u && u.id === userId);
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, UserRow>)) {
      if (v && v.id === userId) {
        idx = Number(k);
        break;
      }
    }
  }
  if (idx < 0 || !Number.isInteger(idx)) return;
  await rtdb(`users.seen:${userId}`, () =>
    getRtdb().ref(`/users/${idx}/lastSeen`).set(iso)
  );
}

// GET /api/presence?ids=a,b -> { status: { id: { online, lastSeen } } }
// Never 500s: presence is best-effort — on RTDB failure return beats-only
// (or empty) status with 200 so polling tabs never toast/crash.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (ids.length === 0) return NextResponse.json({ status: {} });
  try {
    const [seen, beats] = await Promise.all([
      lastSeenFor(ids),
      beatsFor(ids),
    ]);
    const status: Record<string, { online: boolean; lastSeen: string | null }> =
      {};
    const now = Date.now();
    for (const id of ids) {
      const beat = beats.get(id) ?? null;
      status[id] = {
        online: isOnlineAt(beat, now),
        lastSeen:
          beat !== null ? new Date(beat).toISOString() : (seen.get(id) ?? null),
      };
    }
    return NextResponse.json({ status });
  } catch {
    // RTDB down/slow: fall back to beats-only, still 200.
    try {
      const beats = await beatsFor(ids);
      const now = Date.now();
      const status: Record<string, { online: boolean; lastSeen: string | null }> =
        {};
      for (const id of ids) {
        const beat = beats.get(id) ?? null;
        status[id] = {
          online: isOnlineAt(beat, now),
          lastSeen: beat !== null ? new Date(beat).toISOString() : null,
        };
      }
      return NextResponse.json({ status });
    } catch {
      return NextResponse.json({ status: {} });
    }
  }
}

// POST /api/presence -> heartbeat (called every ~20s by open tabs)
export async function POST() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date().toISOString();
  try {
    await touch(session.sub);
  } catch {
    // heartbeat itself failed — still try to record lastSeen, else 200 anyway
  }
  try {
    await touchLastSeen(session.sub, now);
  } catch {
    /* best-effort: heartbeat already counted */
  }
  return NextResponse.json({ ok: true, lastSeen: now });
}
