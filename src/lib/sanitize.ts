// Input hardening, applied on every write route.
// - trims + drops carriage returns (normalize line endings)
// - hard-caps length by GRAPHEME (what the user sees as one character),
//   so compound emoji (ZWJ families, flags, skin tones) are never split
//   in half into "?" boxes — Array.from/slice would break them.
// - React escapes all rendered text by default; rich formatting is parsed
//   into elements by renderRich() — raw HTML is never interpreted anywhere.

function segmenter(): Intl.Segmenter | null {
  try {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      return new Intl.Segmenter("en", { granularity: "grapheme" });
    }
  } catch {
    /* very old runtime */
  }
  return null;
}

export function takeGraphemes(s: string, max: number): string {
  const seg = segmenter();
  if (!seg) return Array.from(s).slice(0, max).join("");
  let out = "";
  let n = 0;
  for (const { segment } of seg.segment(s)) {
    if (n >= max) break;
    out += segment;
    n += 1;
  }
  return out;
}

export function graphemeLen(s: string): number {
  const seg = segmenter();
  if (!seg) return Array.from(s).length;
  let n = 0;
  for (const _ of seg.segment(s)) n += 1;
  return n;
}

export function clean(input: unknown, max: number): string {
  const s = String(input ?? "")
    .replace(/\r/g, "")
    .trim();
  return takeGraphemes(s, max);
}