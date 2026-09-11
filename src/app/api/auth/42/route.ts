import { NextResponse } from "next/server";
import { fortyTwoAuthorizeUrl } from "@/lib/forty-two";

function rand(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function GET() {
  if (!process.env.FORTY_TWO_UID) {
    return NextResponse.json(
      { error: "42 app not configured (FORTY_TWO_UID)." },
      { status: 500 }
    );
  }
  const state = rand();
  const url = fortyTwoAuthorizeUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
