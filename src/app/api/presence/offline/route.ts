import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { markOffline } from "@/lib/presence";
import { getRtdb, rtdb } from "@/lib/fbrdb";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: true });
  const now = new Date().toISOString();
  try {
    await markOffline(session.sub);
  } catch {
  }
  try {
    const snap = await rtdb("users.idx", () =>
      getRtdb().ref("/users").get()
    );
    const raw = snap.val() as unknown;
    let key: string | null = null;
    if (Array.isArray(raw)) {
      const idx = (raw as { id?: string }[]).findIndex(
        (u) => u && u.id === session.sub
      );
      if (idx >= 0) key = String(idx);
    } else if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw as Record<string, { id?: string }>)) {
        if (v && v.id === session.sub) {
          key = k;
          break;
        }
      }
    }
    if (key !== null) {
      await rtdb(`users.seen:${session.sub}`, () =>
        getRtdb().ref(`/users/${key}/lastSeen`).set(now)
      );
    }
  } catch {
  }
  return NextResponse.json({ ok: true, lastSeen: now });
}
