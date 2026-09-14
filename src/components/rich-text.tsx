import { Fragment, type ReactNode } from "react";
const TOKEN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;
const URL_RE = /^https?:\/\//i;
function isUrl(s: string): boolean { return URL_RE.test(s); }
function LinkNode({ href, idx }: { href: string; idx: number }) {
  return (
    <a key={idx} href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-[#7C3AED] underline decoration-[#7C3AED]/30 underline-offset-2 hover:decoration-[#7C3AED]" onClick={(e) => e.stopPropagation()}>{href}</a>
  );
}
export function renderRich(text: string): ReactNode[] {
  return String(text ?? "").split(TOKEN).map((part, i) => {
    if (isUrl(part)) return <LinkNode href={part} idx={i} />;
    if (part.length >= 5 && part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length >= 3 && part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.length >= 3 && part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.9em] dark:bg-zinc-800">{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
export function stripMarkup(text: string): string { return String(text ?? "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/`([^`]+)`/g, "$1"); }
export function hasLink(text: string): boolean { return /https?:\/\/[^\s<]+/i.test(String(text ?? "")); }
