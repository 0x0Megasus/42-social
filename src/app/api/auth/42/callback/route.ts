import { NextResponse } from "next/server";
import { exchange42Code, fetch42Me } from "@/lib/forty-two";
import { updateDB, uid } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/session";
import { safeNext } from "@/lib/redirect";
import { clean } from "@/lib/sanitize";

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
    const token = await exchange42Code(code);
    const me = await fetch42Me(token);

    const user = await updateDB((db) => {
      const existing = db.users.find(
        (u) => u.email.toLowerCase() === String(me.email).toLowerCase()
      );
      const campus = me.campus?.[0]?.name ?? null;
      const coalition = me.coalitions?.[0]?.name ?? null;
      const fullName = clean(
        me.usual_full_name || me.displayname || me.login,
        60
      );
      const avatar = me.image?.link ?? null;
      if (existing) {
        existing.login42 = me.login;
        existing.name = existing.name || fullName;
        if (avatar && !existing.avatar) existing.avatar = avatar;
        if (campus) existing.campus = campus;
        if (coalition) existing.coalition = coalition;
        return existing;
      }
      const fresh = {
        id: uid("u"),
        email: me.email,
        name: fullName,
        login42: me.login,
        googleId: null,
        avatar,
        campus,
        coalition,
        bio: "",
        socials: [],
        lastSeen: null as string | null,
        createdAt: new Date().toISOString(),
      };
      db.users.push(fresh);
      return fresh;
    });

    await setSessionCookie(
      await createSession({ sub: user.id, email: user.email, name: user.name })
    );
    const res = NextResponse.redirect(`${base}${resume}`);
    res.cookies.delete("oauth_state");
    res.cookies.delete("post_login");
    return res;
  } catch {
    return NextResponse.redirect(`${base}/login?error=oauth`);
  }
}
