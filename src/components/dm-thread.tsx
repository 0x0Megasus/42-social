"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Reply, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { EmojiPicker, kickColor } from "@/components/emoji-picker";
import { AutoGrowTextarea } from "@/components/auto-grow-textarea";
import { renderRich, stripMarkup } from "@/components/rich-text";
import { Avatar } from "@/components/post-card";
import { ChatSkeleton } from "@/components/skeletons";
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

// Discord-inspired palette (own identity, same principles) — black chat theme
const C = {
  bg: "bg-black",
  text: "text-[#DBDEE1]",
  username: "text-[#F2F3F5]",
  time: "text-[#949BA4]",
  hover: "hover:bg-[#1e1f22]",
  accent: "#5865F2",
  danger: "#ED4245",
} as const;

const GROUP_GAP_MS = 5 * 60_000;

export function DmThread({
  convoId,
  peerName,
  peerId,
  myId,
  peerAvatar = null,
  myName = "You",
  myAvatar = null,
}: {
  convoId: string;
  peerName: string;
  peerId: string;
  myId: string;
  peerAvatar?: string | null;
  myName?: string;
  myAvatar?: string | null;
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
  const dmInputRef = useRef<HTMLTextAreaElement>(null);
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
    const cleanText = text.trim();
    if (!cleanText || busy) return;
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
      body: cleanText,
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
          body: cleanText,
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

  function displayName(m: Msg) {
    return m.mine ? myName : peerName;
  }

  function profileHref(m: Msg) {
    return `/profile/${encodeURIComponent(m.mine ? myId : peerId)}`;
  }

  function avatarFor(m: Msg) {
    const node = m.mine ? (
      <Avatar name={myName} src={myAvatar} size={40} />
    ) : (
      <Avatar name={peerName} src={peerAvatar} size={40} />
    );
    return (
      <Link
        href={profileHref(m)}
        aria-label={`View ${displayName(m)}'s profile`}
        className="block rounded-full transition-opacity hover:opacity-80"
      >
        {node}
      </Link>
    );
  }

  // Group consecutive messages from the same author (5-min window),
  // broken by deletes / stickers / replies — Discord-style compact flow.
  function groupedWithPrev(idx: number): boolean {
    if (idx === 0) return false;
    const prev = msgs[idx - 1];
    const cur = msgs[idx];
    if (prev.deleted || cur.deleted) return false;
    if (prev.kind === "sticker" || cur.kind === "sticker") return false;
    if (cur.replyTo) return false;
    if (prev.mine !== cur.mine) return false;
    const gap =
      new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime();
    return gap >= 0 && gap < GROUP_GAP_MS;
  }

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#2E3035]",
        C.bg,
        C.text
      )}
    >
      <div
        ref={scrollRef}
        onScroll={onThreadScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 pt-5 [scrollbar-gutter:stable]"
      >
        {loading ? (
          <ChatSkeleton rows={4} label="Loading messages" density="dm" />
        ) : (
          <>
            {msgs.length === 0 && (
              <p className="px-4 py-8 text-center text-[13px] text-[#949BA4]">
                No messages yet — say hi.
              </p>
            )}
            {msgs.map((m, i) => {
              if (m.deleted) {
                return (
                  <div
                    key={m.id}
                    className={cn("px-4 py-0.5", C.hover)}
                  >
                    <p className="ml-[52px] py-0.5 text-[13px] italic text-[#949BA4]">
                      {m.mine ? "You deleted this message" : "Message deleted"}
                    </p>
                  </div>
                );
              }

              const isEditing = editingId === m.id;
              const isTemp = m.id.startsWith("tmp-");
              const compact = groupedWithPrev(i);
              const fullTime = new Date(m.createdAt).toLocaleString();
              const replyName =
                m.replyTo?.senderId === myId
                  ? myName
                  : m.replyTo?.senderId === peerId
                    ? peerName
                    : (m.replyTo?.name ?? "?");
              const armingDelete = confirmDeleteId === m.id;

              const toolbar = !isEditing && !isTemp && (
                <span
                  role="toolbar"
                  aria-label="Message actions"
                  className={cn(
                    "absolute right-3 top-0 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-[#1e1f22] bg-[#111214] p-0.5 shadow-md",
                    "translate-y-1 opacity-0 transition-all duration-150",
                    "group-hover:translate-y-[-50%] group-hover:opacity-100",
                    "group-focus-within:translate-y-[-50%] group-focus-within:opacity-100",
                    "[@media(hover:none)]:translate-y-[-50%] [@media(hover:none)]:opacity-100"
                  )}
                >
                  <button
                    onClick={() => startReply(m)}
                    aria-label="Reply to message"
                    title="Reply"
                    className="flex h-6 w-6 items-center justify-center rounded sm:h-7 sm:w-7 text-[#B5BAC1] transition-colors hover:bg-white/10 hover:text-[#F2F3F5]"
                  >
                    <Reply size={15} className="h-3 w-3 sm:h-[15px] sm:w-[15px]" />
                  </button>
                  {m.mine && !armingDelete && (
                    <>
                      <button
                        onClick={() => {
                          setEditDraft(m.body);
                          setEditingId(m.id);
                          setConfirmDeleteId(null);
                        }}
                        aria-label="Edit message"
                        title="Edit"
                        className="flex h-6 w-6 items-center justify-center rounded sm:h-7 sm:w-7 text-[#B5BAC1] transition-colors hover:bg-white/10 hover:text-[#5865F2]"
                      >
                        <Pencil size={14} className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        aria-label="Delete message"
                        title="Delete"
                        className="flex h-6 w-6 items-center justify-center rounded sm:h-7 sm:w-7 text-[#B5BAC1] transition-colors hover:bg-[#ED4245] hover:text-white"
                      >
                        <Trash2 size={14} className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </button>
                    </>
                  )}
                  {m.mine && armingDelete && (
                    <>
                      <button
                        onClick={() => remove(m.id)}
                        aria-label="Confirm delete"
                        title="Confirm delete"
                        className="flex h-6 w-6 items-center justify-center rounded sm:h-7 sm:w-7 bg-[#ED4245] text-white transition-colors hover:brightness-110"
                      >
                        <Check size={14} className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label="Cancel delete"
                        title="Cancel"
                        className="flex h-6 w-6 items-center justify-center rounded sm:h-7 sm:w-7 text-[#B5BAC1] transition-colors hover:bg-white/10 hover:text-[#F2F3F5]"
                      >
                        <X size={14} className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </button>
                    </>
                  )}
                </span>
              );

              const replyPreview = m.replyTo && !isEditing && (
                <button
                  onClick={() => jumpTo(m.replyTo!.id)}
                  title="Jump to original"
                  className="group/reply mb-0.5 flex max-w-full items-center gap-1.5 text-left"
                >
                  <span
                    aria-hidden
                    className="ml-[21px] h-[10px] w-[31px] shrink-0 rounded-tl-md border-l-2 border-t-2 border-[#4E5058]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] leading-4">
                    <span className="font-semibold text-[#5865F2]">
                      {replyName}
                    </span>{" "}
                    <span className="text-[#949BA4]">
                      {m.replyTo.body === "Sticker"
                        ? "Sticker"
                        : stripMarkup(m.replyTo.body).slice(0, 120)}
                    </span>
                  </span>
                </button>
              );

              const seen =
                m.mine && i === lastMineIdx && m.read ? (
                  <span className="ml-1 text-[11px] text-[#949BA4]">· Seen</span>
                ) : null;

              // Sticker: header row + big glyph, no bubble
              if (m.kind === "sticker") {
                return (
                  <div
                    key={m.id}
                    id={`dm-msg-${m.id}`}
                    className={cn(
                      "group relative scroll-mt-2 px-4",
                      compact ? "py-0.5" : "pb-0.5 pt-2",
                      C.hover,
                      flashId === m.id && "bg-amber-300/20"
                    )}
                  >
                    {toolbar}
                    <div className="flex gap-3">
                      <span className="w-10 shrink-0">
                        {!compact && avatarFor(m)}
                      </span>
                      <div className="min-w-0 flex-1">
                        {!compact && (
                          <p className="flex flex-wrap items-baseline gap-x-2">
                            <Link
                              href={profileHref(m)}
                              title={`View ${displayName(m)}'s profile`}
                              className="text-[14px] font-semibold leading-5 transition-colors hover:underline"
                              style={{ color: kickColor(displayName(m)) }}
                            >
                              {displayName(m)}
                            </Link>
                            <span
                              title={fullTime}
                              className={cn(
                                "text-[11px] font-medium leading-4",
                                C.time
                              )}
                            >
                              {timeAgo(m.createdAt)}
                            </span>
                            {seen}
                          </p>
                        )}
                        <span className="mt-0.5 block text-5xl leading-none">
                          {m.body}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              // Compact follow-up: hover-revealed timestamp gutter, no avatar
              if (compact) {
                return (
                  <div
                    key={m.id}
                    id={`dm-msg-${m.id}`}
                    className={cn(
                      "group relative scroll-mt-2 px-4 py-[3px]",
                      C.hover,
                      flashId === m.id && "bg-amber-300/20"
                    )}
                  >
                    {toolbar}
                    <div className="flex items-baseline gap-3">
                      <span
                        title={fullTime}
                        className="w-10 shrink-0 select-none text-right text-[10px] tabular-nums text-transparent transition-colors group-hover:text-[#949BA4]"
                        aria-hidden
                      >
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div className="min-w-0 flex-1 text-[15px] leading-[22px] text-[#DBDEE1]">
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
                              className="w-full resize-none rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 py-2 text-[14px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
                            />
                            <span className="mt-1 flex gap-1 text-[12px]">
                              <button
                                onClick={() => saveEdit(m.id)}
                                className="rounded-full bg-[#FAFAFA] px-3 py-1 text-[#18181B] hover:bg-[#E4E4E7]"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded-full border border-[#3F3F46] px-3 py-1 text-[#E4E4E7] hover:bg-[#18181B]"
                              >
                                Cancel
                              </button>
                              <span className="py-0.5 text-[#949BA4]">
                                Enter to save · Esc to cancel
                              </span>
                            </span>
                          </span>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">
                            {renderRich(m.body)}
                            {m.edited && (
                              <span className="ml-1 align-baseline text-[11px] text-[#949BA4]">
                                (edited)
                              </span>
                            )}
                            {seen}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // Full row: avatar + username/timestamp header + content
              return (
                <div
                  key={m.id}
                  id={`dm-msg-${m.id}`}
                  className={cn(
                    "group relative scroll-mt-2 px-4 pb-0.5 pt-2",
                    C.hover,
                    flashId === m.id && "bg-amber-300/20"
                  )}
                >
                  {toolbar}
                  {replyPreview}
                  <div className="flex gap-3">
                    <span className="shrink-0 pt-0.5">{avatarFor(m)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <Link
                          href={profileHref(m)}
                          title={`View ${displayName(m)}'s profile`}
                          className="text-[14px] font-semibold leading-5 transition-colors hover:underline"
                          style={{ color: kickColor(displayName(m)) }}
                        >
                          {displayName(m)}
                        </Link>
                        <span
                          title={fullTime}
                          className={cn(
                            "text-[11px] font-medium leading-4",
                            C.time
                          )}
                        >
                          {timeAgo(m.createdAt)}
                        </span>
                        {seen}
                      </p>
                      {isEditing ? (
                        <span className="mt-1 block">
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
                            className="w-full resize-none rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 py-2 text-[14px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
                          />
                          <span className="mt-1 flex gap-1 text-[12px]">
                            <button
                              onClick={() => saveEdit(m.id)}
                              className="rounded-[2px] bg-[#FAFAFA] px-3 py-1 text-[#18181B] hover:bg-[#E4E4E7]"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded-[2px] border border-[#3F3F46] px-3 py-1 text-[#E4E4E7] hover:bg-[#18181B]"
                            >
                              Cancel
                            </button>
                            <span className="py-0.5 text-[#949BA4]">
                              Enter to save · Esc to cancel
                            </span>
                          </span>
                        </span>
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-[#DBDEE1]">
                          {renderRich(m.body)}
                          {m.edited && (
                            <span className="ml-1 align-baseline text-[11px] text-[#949BA4]">
                              (edited)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div aria-hidden className="h-0" />
      </div>

      {!atBottom && (
        <button
          onClick={() => scrollToBottom()}
          aria-label="Scroll to new messages"
          className="absolute bottom-20 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-[#5865F2] text-white shadow-lg transition-opacity hover:brightness-110"
        >
          <ArrowDown size={16} />
        </button>
      )}

      {replyTo && (
        <div className="flex shrink-0 items-center gap-2 border-t border-[#1e1f22] bg-black px-4 py-1.5">
          <span className="min-w-0 flex-1 truncate rounded border-l-2 border-[#5865F2] bg-[#5865F2]/10 px-2 py-1 text-xs">
            <b className="text-[#5865F2]">
              Replying to {replyTo.mine ? "yourself" : peerName}
            </b>{" "}
            <span className="text-[#949BA4]">
              {replyTo.kind === "sticker" ? "Sticker" : stripMarkup(replyTo.body)}
            </span>
          </span>
          <button
            onClick={() => setReplyTo(null)}
            aria-label="Cancel reply"
            className="rounded-full p-1.5 text-[#949BA4] transition-colors hover:bg-white/10 hover:text-[#DBDEE1]"
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
        className="flex shrink-0 items-end gap-1 border-t border-[#1e1f22] bg-black p-2"
      >
        <EmojiPicker onEmoji={(e) => setDraft((d) => takeGraphemes(d + e, 500))} />

        <label htmlFor="dm-input" className="sr-only">
          Message
        </label>
        <div className="relative min-w-0 flex-1">
          <AutoGrowTextarea
          ref={dmInputRef}
          id="dm-input"
          value={draft}
          onChange={(e) => setDraft(takeGraphemes(e.target.value, 500))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={`Message ${peerName}`}
          maxLength={1000}
          autoComplete="off"
          className="min-h-9 w-full rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-4 py-2 pr-12 text-[14px] leading-5 text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
        />
          {draft.length > 0 && (
            <span
              aria-hidden
              className={`pointer-events-none absolute bottom-2 right-2 rounded bg-[#09090B] px-1 text-[10px] tabular-nums ${
                graphemeLen(draft) > 450 ? "text-rose-400" : "text-[#949BA4]"
              }`}
            >
              {graphemeLen(draft)}/500
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          suppressHydrationWarning
          className="h-9 rounded-[2px] bg-[#FAFAFA] px-5 text-[14px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] disabled:opacity-30"
        >
          Send
        </button>
      </form>
    </div>
  );
}
