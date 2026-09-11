import { Fragment, type ReactNode } from "react";

// Safe mini-markdown: **bold**, *italic*, `code`.
// SECURITY: pure string tokenizing into React elements — user text is only
// ever rendered as text nodes, never parsed as HTML. Unmatched markers
// render literally. No nesting (keeps the parser linear and predictable).
const TOKEN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;

export function renderRich(text: string): ReactNode[] {
  return String(text ?? "")
    .split(TOKEN)
    .map((part, i) => {
      if (part.length >= 5 && part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.length >= 3 && part.startsWith("*") && part.endsWith("*")) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.length >= 3 && part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.9em] dark:bg-zinc-800"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <Fragment key={i}>{part}</Fragment>;
    });
}

// Plain-text version for previews (inbox snippets, notifications).
export function stripMarkup(text: string): string {
  return String(text ?? "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
