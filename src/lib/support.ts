import type { User } from "@/lib/db";


export function supportIdentifiers(): string[] {
  return (process.env.SUPPORT_IDENTIFIERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type Identity = Pick<User, "id" | "email" | "login42"> | null | undefined;

export function isSupportUser(u: Identity): boolean {
  if (!u) return false;
  const ids = supportIdentifiers();
  if (ids.length === 0) return false;
  return (
    ids.includes(u.id.toLowerCase()) ||
    ids.includes(u.email.toLowerCase()) ||
    (u.login42 ? ids.includes(u.login42.toLowerCase()) : false)
  );
}
