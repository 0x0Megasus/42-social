import { NextResponse } from "next/server";
import { updateDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { markOffline } from "@/lib/presence";

// POST /api/presence/offline -> last-tab closed (sendBeacon on pagehide).
// Heartbeats from any other open tab/browser heal this within ~20s.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: true });
  const now = new Date().toISOString();
  await Promise.all([
    markOffline(session.sub),
    updateDB((db) => {
      const u = db.users.find((x) => x.id === session.sub);
      if (u) u.lastSeen = now;
    }),
  ]);
  return NextResponse.json({ ok: true, lastSeen: now });
}
