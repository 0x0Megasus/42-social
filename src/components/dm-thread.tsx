"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Reply, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { EmojiPicker } from "@/components/emoji-picker";
import { Quote } from "@/components/quote";
import { renderRich, stripMarkup } from "@/components/rich-text";
import { FormatBar } from "@/components/format-bar";
import { clean, graphemeLen, takeGraphemes } from "@/lib/sanitize";
import { timeAgo } from "@/lib/format";
import { playMessage } from "@/lib/sound";
import type { QuotedReply } from "@/lib/db";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  body: string;
  kind: "text" | "sticker";
  mine: boolean;
  read: boolean;
  edited: boolean;
  deleted: boolean;
  replyTo: QuotedReply;
  createdAt: string;
};

export function DmThread({
  convoId,
  peerName,
  peerId,
  myId,
}: {
  convoId: string;
  peerName: string;
  peerId: string;
  myId: string;
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const dmInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdsRef = useRef<string>("");
  const lastPeerRef = useRef<string>("");
  const nearBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  function scrollToBottom(smooth = true) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setHasNew(false);
  }

  function onThreadScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    nearBottomRef.current = near;
    setAtBottom(near);
    if (near) setHasNew(false);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dm/${convoId}/messages`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 404) {
        router.push("/dm");
        return;
      }
      const d = await res.json();
      const next = d.messages as Msg[];
      // incoming peer message sound (silent on first load)
      const last = next[next.length - 1];
      if (last && !last.mine && last.id !== lastPeerRef.current) {
        if (lastPeerRef.current !== "") playMessage();
        lastPeerRef.current = last.id;
      }
      // auto-scroll only when the reader is already at the bottom —
      // otherwise flag new arrivals and let them jump when ready
      const idsKey = next.map((m) => `${m.id}:${m.edited}:${m.deleted}`).join();
      if (lastIdsRef.current !== idsKey) {
        lastIdsRef.current = idsKey;
        if (nearBottomRef.current) {
          requestAnimationFrame(() => scrollToBottom());
        } else {
          setHasNew(true);
        }
      }
      setMsgs((prev) => {
        const serverIds = new Set(next.map((m) => m.id));
        const now = Date.now();
        // keep only fresh optimistic temps (server echo replaces them on POST)
        const temps = prev.filter(
          (m) =>
            m.id.startsWith("tmp-") &&
            !serverIds.has(m.id) &&
            now - new Date(m.createdAt).getTime() < 15_000
        );
        const merged = [...next, ...temps];
        merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return merged;
      });
    } catch {
      /* polling failure: keep old messages */
    }
  }, [convoId, router]);

  useEffect(() => {
    load().finally(() => {
      setLoading(false);
      requestAnimationFrame(() => scrollToBottom(false));
    });
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    const replySnap: QuotedReply = replyTo
      ? {
          id: replyTo.id,
          body:
            replyTo.kind === "sticker"
              ? "Sticker"
              : replyTo.body.slice(0, 120),
          name: replyTo.mine ? "You" : peerName,
          senderId: replyTo.mine ? myId : peerId,
        }
      : null;
    const temp: Msg = {
      id: `tmp-${Date.now()}`,
      body: clean,
      kind: "text",
      mine: true,
      read: false,
      edited: false,
      deleted: false,
      replyTo: replySnap,
      createdAt: new Date().toISOString(),
    };
    setMsgs((m) => [...m, temp]);
    setDraft("");
    setReplyTo(null);
    requestAnimationFrame(() => scrollToBottom());
    try {
      const res = await fetch(`/api/dm/${convoId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: clean,
          replyToId: replySnap?.id.startsWith("tmp-") ? undefined : replySnap?.id,
        }),
      });
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        setMsgs((m) => m.filter((x) => x.id !== temp.id));
        toast.error(`Slow down — try again in ${d?.retryAfter ?? 10}s.`);
        return;
      }
      if (!res.ok) throw new Error();
      const d = await res.json();
      setMsgs((m) => m.map((x) => (x.id === temp.id ? d.message : x)));
    } catch {
      setMsgs((m) => m.filter((x) => x.id !== temp.id));
      toast.error("Message not sent");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    const text = clean(editDraft, 500);
    if (!text) return;
    const prev = msgs.find((m) => m.id === id);
    setMsgs((m) =>
      m.map((x) =>
        x.id === id ? { ...x, body: text, edited: true } : x
      )
    );
    setEditingId(null);
    try {
      const res = await fetch(`/api/dm/${convoId}/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setMsgs((m) => m.map((x) => (x.id === id ? d.message : x)));
    } catch {
      if (prev)
        setMsgs((m) => m.map((x) => (x.id === id ? prev : x)));
      toast.error("Edit failed");
    }
  }

  async function remove(id: string) {
    const prev = msgs;
    setMsgs((m) =>
      m.map((x) => (x.id === id ? { ...x, deleted: true } : x))
    );
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/dm/${convoId}/messages/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setMsgs((m) => m.map((x) => (x.id === id ? d.message : x)));
    } catch {
      setMsgs(prev);
      toast.error("Delete failed");
    }
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`dm-msg-${id}`);
    if (!el) {
      toast.info("Original message isn't loaded here.");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1200);
  }

  function startReply(m: Msg) {
    setReplyTo(m);
    setConfirmDeleteId(null);
    document
      .getElementById("dm-input")
      ?.focus({ preventScroll: true });
  }

  const lastMineIdx = [...msgs]
    .map((m, i) => (m.mine && !m.deleted ? i : -1))
    .filter((i) => i >= 0)
    .pop();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* internal scroll only — reserved gutter so layout never shifts */}
      <div
        ref={scrollRef}
        onScroll={onThreadScroll}
        className="relative min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] p-3"
      >
        {loading ? (
          <div role="status" aria-label="Loading messages" className="space-y-1.5">
            <div className="h-10 w-2/3 animate-pulse rounded-2xl rounded-bl-md bg-zinc-200 dark:bg-zinc-800" />
            <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl rounded-br-md bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-14 w-3/5 animate-pulse rounded-2xl rounded-bl-md bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ) : (
          <>
            {msgs.length === 0 && (
              <p className="py-8 text-center text-[13px] text-zinc-400">
                No messages yet — say hi.
              </p>
            )}
            {msgs.map((m, i) => {
          if (m.deleted) {
            return (
              <div
                key={m.id}
                className={cn("flex", m.mine ? "justify-end" : "justify-start")}
              >
                <p className="rounded-2xl bg-zinc-100/70 px-3 py-2 text-[13px] italic text-zinc-400 dark:bg-zinc-900/70">
                  {m.mine ? "You deleted this message" : "Message deleted"}
                </p>
              </div>
            );
          }
          if (m.kind === "sticker") {
            return (
              <div
                key={m.id}
                className={cn("flex", m.mine ? "justify-end" : "justify-start")}
              >
                <span className="text-5xl leading-none">{m.body}</span>
              </div>
            );
          }
          const isEditing = editingId === m.id;
          return (
            <div
              key={m.id}
              id={`dm-msg-${m.id}`}
              className={cn(
                "group flex scroll-mt-2 rounded-lg px-1 py-0.5",
                m.mine ? "justify-end" : "justify-start",
                flashId === m.id && "bg-orange-200/70 dark:bg-orange-500/15"
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3 py-2 text-[14.5px] leading-6 shadow-sm",
                  m.mine
                    ? "rounded-br-md bg-zinc-950 text-white ring-1 ring-zinc-800 dark:bg-black dark:text-zinc-100 dark:ring-zinc-700"
                    : "rounded-bl-md border border-zinc-200/70 bg-zinc-100 text-zinc-900 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-50"
                )}
              >
                {m.replyTo && !isEditing && (
                  <Quote
                    name={
                      m.replyTo.senderId === myId ? "You" : peerName
                    }
                    body={m.replyTo.body}
                    mine={m.replyTo.senderId === myId}
                    onJump={() => jumpTo(m.replyTo!.id)}
                  />
                )}
                {isEditing ? (
                  <span className="block">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      maxLength={500}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit(m.id);
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full resize-none rounded-lg bg-white/15 px-2 py-1 text-[14px] outline-none dark:bg-white/10"
                    />
                    <span className="mt-1 flex justify-end gap-1">
                      <button
                        onClick={() => saveEdit(m.id)}
                        aria-label="Save edit"
                        className="rounded-full p-1.5 hover:bg-black/10 dark:hover:bg-white/10"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel edit"
                        className="rounded-full p-1.5 hover:bg-black/10 dark:hover:bg-white/10"
                      >
                        <X size={15} />
                      </button>
                    </span>
                  </span>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap break-words">{renderRich(m.body)}</p>
                    <p
                      className={cn(
                        "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                        m.mine ? "text-white/60" : "text-zinc-400"
                      )}
                    >
                      {m.edited && <span>Edited · </span>}
                      {timeAgo(m.createdAt)}
                      {m.mine && i === lastMineIdx && m.read ? " · Seen" : ""}
                    </p>
                  </>
                )}
              </div>
              {!isEditing && !m.id.startsWith("tmp-") && (
                <span className="flex flex-col justify-center gap-0.5 pl-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                  <button
                    onClick={() => startReply(m)}
                    aria-label="Reply to message"
                    title="Reply"
                    className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <Reply size={14} />
                  </button>
                  {m.mine && (
                    <>
                      {confirmDeleteId === m.id ? (
                    <>
                      <button
                        onClick={() => remove(m.id)}
                        aria-label="Confirm delete"
                        title="Confirm delete"
                        className="rounded-full p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label="Cancel delete"
                        title="Cancel"
                        className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditDraft(m.body);
                          setEditingId(m.id);
                          setConfirmDeleteId(null);
                        }}
                        aria-label="Edit message"
                        title="Edit"
                        className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        aria-label="Delete message"
                        title="Delete"
                        className="rounded-full p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                  </>
                )}
                </span>
              )}
            </div>
          );
        })}
          </>
        )}
        <div aria-hidden className="h-0" />
      </div>
      {hasNew && !atBottom && (
        <button
          onClick={() => scrollToBottom()}
          aria-label="Scroll to new messages"
          className="absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-opacity hover:opacity-85 dark:bg-zinc-50 dark:text-zinc-900"
        >
          <ArrowDown size={13} /> New messages
        </button>
      )}
      {replyTo && (
        <div className="flex shrink-0 items-center gap-2 border-t border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
          <span className="min-w-0 flex-1 truncate rounded border-l-2 border-[#5865F2] bg-[#5865F2]/10 px-2 py-1 text-xs">
            <b className="text-[#5865F2]">
              Replying to {replyTo.mine ? "yourself" : peerName}
            </b>{" "}
            <span className="text-zinc-500 dark:text-zinc-400">
              {replyTo.kind === "sticker" ? "Sticker" : stripMarkup(replyTo.body)}
            </span>
          </span>
          <button
            onClick={() => setReplyTo(null)}
            aria-label="Cancel reply"
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex shrink-0 items-center gap-1 border-t border-zinc-200 p-2 dark:border-zinc-800"
      >
        <EmojiPicker onEmoji={(e) => setDraft((d) => takeGraphemes(d + e, 500))} />
        <FormatBar
          targetRef={dmInputRef}
          value={draft}
          onChange={(v) => setDraft(takeGraphemes(v, 500))}
          max={500}
        />
        <label htmlFor="dm-input" className="sr-only">
          Message
        </label>
        <input
          ref={dmInputRef}
          id="dm-input"
          value={draft}
          onChange={(e) => setDraft(takeGraphemes(e.target.value, 500))}
          placeholder="Message…"
          maxLength={1000}
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-full border border-zinc-200 bg-transparent px-4 text-[14px] outline-none focus:border-cyan-500 dark:border-zinc-700"
        />
        <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
          {graphemeLen(draft)}/500
        </span>
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          suppressHydrationWarning
          className="h-10 rounded-full bg-zinc-900 px-5 text-[14px] font-semibold text-white disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Send
        </button>
      </form>
    </div>
  );
}
