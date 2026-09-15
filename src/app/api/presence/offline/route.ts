import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { markOffline } from "@/lib/presence";
import { getRtdb, rtdb } from "@/lib/fbrdb";

// POST /api/presence/offline -> last-tab closed (sendBeacon on pagehide).
// Heartbeats from any other open tab/browser heal this within ~20s.
// Never 500s (beacon has no retry): always 200.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: true });
  const now = new Date().toISOString();
  try {
    await markOffline(session.sub);
  } catch {
    /* best-effort */
  }
  try {
    const snap = await rtdb("users.idx", () =>
      getRtdb().ref("/users").get()
    );
    const raw = snap.val() as unknown;
    let idx = -1;
    if (Array.isArray(raw)) {
      idx = (raw as { id?: string }[]).findIndex(
        (u) => u && u.id === session.sub
      );
    }
    if (idx >= 0) {
      await rtdb(`users.seen:${session.sub}`, () =>
        getRtdb().ref(`/users/${idx}/lastSeen`).set(now)
      );
    }
  } catch {
    /* best-effort: offline mark already counted */
  }
  return NextResponse.json({ ok: true, lastSeen: now });
}
