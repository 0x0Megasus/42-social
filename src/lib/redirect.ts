export function safeNext(v: string | null | undefined): string {
  if (!v || v.length > 200) return "/";
  if (!v.startsWith("/")) return "/";
  if (v.startsWith("//")) return "/";
  if (v.includes("://")) return "/";
  if (/[\r\n]/.test(v)) return "/";
  return v;
}
