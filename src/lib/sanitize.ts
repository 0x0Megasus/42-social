// Input hardening, applied on every write route.
// - trims + drops carriage returns (normalize line endings)
// - hard-caps length WITHOUT splitting unicode (emoji-safe via Array.from)
// - React escapes all rendered text by default; rich formatting is parsed
//   into elements by renderRich() — raw HTML is never interpreted anywhere.

export function clean(input: unknown, max: number): string {
  const s = String(input ?? "")
    .replace(/\r/g, "")
    .trim();
  if (s.length <= max) return s;
  return Array.from(s).slice(0, max).join("");
}
