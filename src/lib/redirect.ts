// Where to send the user after login. Strictly same-origin paths only
// (open-redirect safe): must start with one "/" and never "//" or "://".
export function safeNext(v: string | null | undefined): string {
  if (!v || v.length > 200) return "/";
  if (!v.startsWith("/")) return "/";
  if (v.startsWith("//")) return "/";
  if (v.includes("://")) return "/";
  if (/[\r\n]/.test(v)) return "/";
  return v;
}
