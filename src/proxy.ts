import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isMaintenanceMode } from "@/lib/maintenance";
import { cachedUserById } from "@/lib/db";
import { isSupportUser } from "@/lib/support";

function secret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") return null;
    return new TextEncoder().encode("dev-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

async function getSessionUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("session")?.value;
  const sec = secret();
  if (!token || !sec) return null;
  try {
    try {
      const { payload } = await jwtVerify(token, sec, {
        issuer: "42-social",
        audience: "42-social-web",
      });
      return payload.sub ? String(payload.sub) : null;
    } catch {
      const { payload } = await jwtVerify(token, sec);
      return payload.sub ? String(payload.sub) : null;
    }
  } catch {
    return null;
  }
}

async function isSupportUserId(userId: string): Promise<boolean> {
  try {
    const user = await cachedUserById(userId);
    return isSupportUser(user);
  } catch {
    return false;
  }
}

// Everything requires login except /login, /api/auth/* and static assets.
export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isMaintenanceMode()) {
    const sessionUserId = await getSessionUserId(req);
    let isSupport = false;
    if (sessionUserId) {
      isSupport = await isSupportUserId(sessionUserId);
    }

    // Support users bypass everything
    if (isSupport) return NextResponse.next();

    // Non-support: allow /login and /api/auth/* so they can try to log in
    // (auth routes will block non-support users from creating sessions)
    if (pathname === "/login" || pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    // Block everything else
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "site under maintenance" },
        { status: 503 }
      );
    }

    // Redirect to login
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.cookies.set("post_login", `${pathname}${search}`.slice(0, 200), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 300,
    });
    return res;
  }

  // ---- Normal mode ----
  if (pathname === "/login") return NextResponse.next();
  const sessionUserId = await getSessionUserId(req);
  if (sessionUserId) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const res = NextResponse.redirect(url);
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
