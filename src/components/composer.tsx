"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EmojiPicker } from "@/components/emoji-picker";
import { FormatBar } from "@/components/format-bar";
import { graphemeLen, takeGraphemes } from "@/lib/sanitize";
import type { FeedPost } from "@/components/post-card";

export function Composer({
  author,
  onPosted,
}: {
  author: NonNullable<FeedPost["author"]>;
  onPosted?: (post: FeedPost) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        toast.error(
          d?.error === "duplicate"
            ? "Duplicate post — say something new."
            : `Slow down — try again in ${d?.retryAfter ?? 60}s.`
        );
        return;
      }
      if (!res.ok) throw new Error();
      const d = await res.json();
      setBody("");
      // instant insert: show the post immediately, no waiting for refresh
      onPosted?.({
        ...d.post,
        author,
        likes: 0,
        comments: 0,
        liked: false,
        edited: false,
        deleted: false,
      });
      router.refresh();
    } catch {
      toast.error("Couldn't post. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <label htmlFor="composer" className="sr-only">
        Share something with campus
      </label>
      <textarea
        ref={areaRef}
        id="composer"
        value={body}
        onChange={(e) => setBody(takeGraphemes(e.target.value, 500))}
        placeholder="Share a win, a project, a question…"
        rows={2}
        maxLength={1000}
        className="w-full resize-none bg-transparent text-[15px] leading-6 outline-none placeholder:text-zinc-400"
      />
      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <EmojiPicker onEmoji={(e) => setBody((b) => takeGraphemes(b + e, 500))} />
          <FormatBar
            targetRef={areaRef}
            value={body}
            onChange={(v) => setBody(takeGraphemes(v, 500))}
            max={500}
          />
          <span className="shrink-0 text-xs tabular-nums text-zinc-400">
            {graphemeLen(body)}/500
          </span>
        </div>
        <button
          type="submit"
          disabled={!body.trim() || busy}
          suppressHydrationWarning
          className="cursor-pointer rounded-full bg-zinc-900 px-4 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {busy ? "Posting…" : "Post"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        Tip: <b>**bold**</b>, <i>*italic*</i>, <code>`code`</code>
      </p>
    </form>
  );
}
