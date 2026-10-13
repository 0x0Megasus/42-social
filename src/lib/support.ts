import type { User } from "@/lib/db";


export function supportIdentifiers(): string[] {
  const ids = (process.env.SUPPORT_IDENTIFIERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // Founder is the 42 account aech-cha — never a gmail.
  if (ids.length === 0) return ["aech-cha"];
  return ids;
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
