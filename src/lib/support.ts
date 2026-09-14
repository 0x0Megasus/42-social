import type { User } from "@/lib/db";

// Owner/support allowlist. Set SUPPORT_IDENTIFIERS as a comma-separated
// list — each entry can be an email, a 42 login, or a user id, matched
// case-insensitively. Empty = nobody (fail closed).
// Example: SUPPORT_IDENTIFIERS="owner@gmail.com, omeg4sus"

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
