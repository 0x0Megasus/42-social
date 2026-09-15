import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";
import { upsertUserByEmail } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/session";
import { safeNext } from "@/lib/redirect";
import { clean } from "@/lib/sanitize";
import { isMaintenanceMode } from "@/lib/maintenance";
import { isSupportUser } from "@/lib/support";

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

export async function POST(req: Request) {
  const { idToken } = (await req.json().catch(() => ({}))) as {
    idToken?: string;
  };
  if (!idToken)
    return NextResponse.json({ error: "idToken required" }, { status: 400 });

  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    "";

  let email = "";
  let name = "";
  let googleId = "";
  let avatar: string | null = null;

  try {
    if (!projectId) throw new Error("no-project");
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    email = String(payload.email ?? "");
    name = String(payload.name ?? (payload.email ?? "Student"));
    googleId = String(payload.user_id ?? payload.sub ?? "");
    avatar = (payload.picture as string | undefined) ?? null;
  } catch {
    // Production NEVER accepts unverified tokens — Firebase project is mandatory.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }
    // DEV ONLY fallback: decode without verify (documented; configure Firebase for prod)
    try {
      const p = decodeJwt(idToken);
      email = String(p.email ?? "");
      name = String(p.name ?? email);
      googleId = String(p.user_id ?? p.sub ?? "");
      avatar = (p.picture as string | undefined) ?? null;
    } catch {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }
  }

  if (!email)
    return NextResponse.json({ error: "email missing" }, { status: 400 });
  // provider display names render site-wide — bound + normalize them
  name = clean(name, 60) || email;

  // Scoped email upsert (no root transaction — the old updateDB-on-`/`
  // timed out as the database grew).
  const user = await upsertUserByEmail({
    email,
    name,
    login42: null,
    googleId: googleId || null,
    avatar,
    campus: null,
    coalition: null,
  });

  if (isMaintenanceMode() && !isSupportUser(user)) {
    return NextResponse.json(
      { error: "site under maintenance" },
      { status: 503 }
    );
  }

  await setSessionCookie(
    await createSession({ sub: user.id, email: user.email, name: user.name })
  );
  const jar = await cookies();
  const redirect = safeNext(jar.get("post_login")?.value);
  jar.delete("post_login");
  return NextResponse.json({ ok: true, redirect });
}
