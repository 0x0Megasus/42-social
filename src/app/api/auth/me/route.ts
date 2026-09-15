import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/session";
import { cachedUserById, userPublic } from "@/lib/db";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  // O(1) map read (cached 30s) instead of a full-root scan.
  const user = await cachedUserById(session.sub);
  return NextResponse.json(
    { user: user ? userPublic(user) : null },
    {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    }
  );
}
