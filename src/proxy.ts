import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

function secret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") return null;
    return new TextEncoder().encode("dev-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

async function hasSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("session")?.value;
  const sec = secret();
  if (!token || !sec) return false;
  try {
    await jwtVerify(token, sec);
    return true;
  } catch {
    return false;
  }
}

// Everything requires login except /login, /api/auth/* and static assets.
export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (await hasSession(req)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const res = NextResponse.redirect(url);
  // where to resume after login (validated on use — must be a local path)
  res.cookies.set("post_login", `${pathname}${search}`.slice(0, 200), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return res;
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|sounds|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|ico)).*)",
  ],
};
