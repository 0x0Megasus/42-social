import { getRtdb } from "@/lib/fbrdb";

// Presence, serverless-safe: heartbeats live in RTDB (/presence/{uid} = ms),
// NOT in process memory (serverless instances don't share memory).
// Online = heartbeat within ONLINE_WINDOW. Correct offline handling:
// client beacons /api/presence/offline on last-tab close (pagehide),
// and any stale entry expires by WINDOW anyway.

export const ONLINE_WINDOW_MS = 75_000;
const REF = "/presence";

export async function touch(userId: string): Promise<number> {
  const at = Date.now();
  await getRtdb().ref(`${REF}/${userId}`).set(at);
  return at;
}

export async function markOffline(userId: string): Promise<void> {
  await getRtdb().ref(`${REF}/${userId}`).remove();
}

export async function beatsFor(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const snap = await getRtdb().ref(REF).get();
  const val = (snap.val() ?? {}) as Record<string, number>;
  for (const id of ids) {
    const at = val[id];
    if (typeof at === "number") out.set(id, at);
  }
  // best-effort prune of ancient entries (don't await callers on it)
  void prune(val).catch(() => null);
  return out;
}

async function prune(val: Record<string, number>): Promise<void> {
  const cutoff = Date.now() - 24 * 3600_000;
  const updates: Record<string, null> = {};
  let dirty = false;
  for (const [k, v] of Object.entries(val)) {
    if (typeof v !== "number" || v < cutoff) {
      updates[`${REF}/${k}`] = null;
      dirty = true;
    }
  }
  if (dirty) await getRtdb().ref("/").update(updates);
}

export function isOnlineAt(beat: number | null | undefined, now = Date.now()): boolean {
  return beat !== null && beat !== undefined && now - beat < ONLINE_WINDOW_MS;
}
