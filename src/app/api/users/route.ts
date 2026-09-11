import { NextResponse } from "next/server";
import { readDB, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";

// GET /api/users -> public directory (same data as /explore). Session required.
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await readDB();
  return NextResponse.json({
    users: db.users.map((u) => userPublic(u)),
  });
}
