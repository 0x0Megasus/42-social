import { NextResponse } from "next/server";
import { exchange42Code, fetch42Me, isEnrolledStudent } from "@/lib/forty-two";
import { upsertUserByEmail } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/session";
import { safeNext } from "@/lib/redirect";
import { clean } from "@/lib/sanitize";
import { isMaintenanceMode } from "@/lib/maintenance";
import { isSupportUser } from "@/lib/support";

function cookieVal(header: string | null, name: string): string | null {
  if (!header) return null;
  const m = header.match(new RegExp(`${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieHeader = req.headers.get("cookie");
  const expected = cookieVal(cookieHeader, "oauth_state");
  const resume = safeNext(cookieVal(cookieHeader, "post_login"));

  const base = `${url.protocol}//${url.host}`;
  if (!code) return NextResponse.redirect(`${base}/login?error=denied`);
  if (!state || state !== expected) {
    return NextResponse.redirect(`${base}/login?error=state`);
  }

  try {
    let token: string;
    try {
      token = await exchange42Code(code);
    } catch (e) {
      console.error("[42/callback] token exchange failed:", e);
      return NextResponse.redirect(`${base}/login?error=oauth_token`);
    }

    let me;
    try {
      me = await fetch42Me(token);
    } catch (e) {
      console.error("[42/callback] /v2/me failed:", e);
      return NextResponse.redirect(`${base}/login?error=oauth_me`);
    }

    if (!isEnrolledStudent(me)) {
      return NextResponse.redirect(`${base}/login?error=not_student`);
    }

    const campus = me.campus?.[0]?.name ?? null;
    const coalition = me.coalitions?.[0]?.name ?? null;
    const fullName = clean(
      me.usual_full_name || me.displayname || me.login,
      60
    );
    const avatar = me.image?.link ?? null;
    let user;
    try {
      user = await upsertUserByEmail({
        email: me.email,
        name: fullName,
        login42: me.login,
        avatar,
        campus,
        coalition,
      });
    } catch (e) {
      console.error("[42/callback] db upsert failed:", e);
      return NextResponse.redirect(`${base}/login?error=oauth_db`);
    }

    if (isMaintenanceMode() && !isSupportUser(user)) {
      return NextResponse.json(
        { error: "site under maintenance" },
        { status: 503 }
      );
    }

    try {
      await setSessionCookie(
        await createSession({ sub: user.id, email: user.email, name: user.name })
      );
    } catch (e) {
      console.error("[42/callback] session failed:", e);
      return NextResponse.redirect(`${base}/login?error=oauth_session`);
    }
    const res = NextResponse.redirect(`${base}${resume}`);
    res.cookies.delete("oauth_state");
    res.cookies.delete("post_login");
    return res;
  } catch (e) {
    console.error("[42/callback] unexpected:", e);
    return NextResponse.redirect(`${base}/login?error=oauth`);
  }
}
