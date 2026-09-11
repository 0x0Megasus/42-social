import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/session";
import { readDB, userPublic } from "@/lib/db";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  const db = await readDB();
  const user = db.users.find((u) => u.id === session.sub);
  return NextResponse.json({ user: user ? userPublic(user) : null });
}
