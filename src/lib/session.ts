import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7d
const ISSUER = "42-social";
const AUDIENCE = "42-social-web";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is missing — refusing to sign sessions");
    }
    return new TextEncoder().encode("dev-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
};

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, secret(), {
        issuer: ISSUER,
        audience: AUDIENCE,
      }));
    } catch {
      ({ payload } = await jwtVerify(token, secret()));
    }
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}
