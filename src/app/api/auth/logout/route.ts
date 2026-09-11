import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

export async function GET(req: Request) {
  await clearSessionCookie();
  const url = new URL(req.url);
  return NextResponse.redirect(`${url.protocol}//${url.host}/login`);
}
