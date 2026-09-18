"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Reply, ArrowDown, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { EmojiPicker, kickColor } from "@/components/emoji-picker";
import { AutoGrowTextarea } from "@/components/auto-grow-textarea";
import { renderRich, stripMarkup } from "@/components/rich-text";
import { Avatar } from "@/components/post-card";
import { ChatSkeleton } from "@/components/skeletons";
import { clean, graphemeLen, takeGraphemes } from "@/lib/sanitize";
import { timeAgo } from "@/lib/format";
import { playMessage } from "@/lib/sound";
import { formatDuration, mediaStatus, uploadFile } from "@/lib/media";
import { VoicePlayer, VoiceRecorder, type VoiceClip } from "@/components/voice-note";
import type { QuotedReply } from "@/lib/db";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  body: string;
  kind: "text" | "sticker" | "voice";
  mine: boolean;
  read: boolean;
  edited: boolean;
  deleted: boolean;
  replyTo: QuotedReply;
  createdAt: string;
  sending?: boolean;
  attachment?: {
    url: string;
    duration: number | null;
    peaks: number[] | null;
    bytes: number | null;
    mime: string | null;
    publicId?: string | null;
  } | null;
};

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

function tempId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `tmp-${crypto.randomUUID()}`;
    }
  } catch {
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

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
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const dmInputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdsRef = useRef<string>("");
  const lastPeerRef = useRef<string>("");
  const nearBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);
  const [canOlder, setCanOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const onPreviewing = useCallback((active: boolean) => setVoicing(active), []);
  const sendingVoiceRef = useRef(false);

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
      if (typeof d.hasMore === "boolean") setCanOlder(d.hasMore);
      const last = next[next.length - 1];
      if (last && !last.mine && last.id !== lastPeerRef.current) {
        if (lastPeerRef.current !== "") playMessage();
        lastPeerRef.current = last.id;
      }
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
        const temps = prev.filter(
          (m) =>
            m.id.startsWith("tmp-") &&
            !serverIds.has(m.id) &&
            now - new Date(m.createdAt).getTime() < 15_000
        );
        const byId = new Map<string, Msg>();
        for (const m of prev) {
          if (!m.id.startsWith("tmp-")) byId.set(m.id, m);
        }
        for (const m of next) byId.set(m.id, m);
        const seen = new Set(byId.keys());
        const merged = [...byId.values()];
        for (const t of temps) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            merged.push(t);
          }
        }
        merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return merged.slice(-1000);
      });
    } catch {
    }
  }, [convoId, router]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      const offset = msgs.filter((m) => !m.id.startsWith("tmp-")).length;
      const res = await fetch(
        `/api/dm/${convoId}/messages?offset=${offset}`
      );
      if (!res.ok) return;
      const d = await res.json();
      const older = (d.messages ?? []) as Msg[];
      if (typeof d.hasMore === "boolean") setCanOlder(d.hasMore);
      if (older.length > 0) {
        const el = scrollRef.current;
        const prevH = el?.scrollHeight ?? 0;
        setMsgs((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = older.filter((m) => !seen.has(m.id));
          const merged = [...fresh, ...prev];
          merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return merged;
        });
        requestAnimationFrame(() => {
          const el2 = scrollRef.current;
          if (el2) el2.scrollTop += el2.scrollHeight - prevH;
        });
      }
    } catch {
    } finally {
      setLoadingOlder(false);
    }
  }, [convoId, loadingOlder, msgs]);

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
      id: tempId(),
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

  async function sendVoice(clip: VoiceClip) {
    if (busy || sendingVoiceRef.current) return;
    sendingVoiceRef.current = true;
    const status = await mediaStatus();
    if (!status.ready) {
      sendingVoiceRef.current = false;
      toast.error("Voice notes are unavailable right now — try again later.");
      return;
    }
    setBusy(true);
    const temp: Msg = {
      id: tempId(),
      body: `Voice message (${formatDuration(clip.duration)})`,
      kind: "voice",
      mine: true,
      read: false,
      edited: false,
      deleted: false,
      replyTo: null,
      createdAt: new Date().toISOString(),
      sending: true,
      attachment: {
        url: clip.url,
        duration: clip.duration,
        peaks: clip.peaks,
        bytes: clip.blob.size,
        mime: clip.mime,
        publicId: null,
      },
    };
    setMsgs((m) => [...m, temp]);
    requestAnimationFrame(() => scrollToBottom());
    try {
      const up = await uploadFile("voice", myId, clip.blob);
      const res = await fetch(`/api/dm/${convoId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: temp.body,
          kind: "voice",
          attachment: {
            url: up.url,
            duration: clip.duration,
            peaks: clip.peaks,
            bytes: up.bytes,
            mime: clip.mime,
            publicId: up.publicId,
          },
        }),
      });
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        setMsgs((m) => m.filter((x) => x.id !== temp.id));
        toast.error(
          d?.error === "daily-quota"
            ? "Daily upload limit reached — try again tomorrow."
            : `Slow down — try again in ${d?.retryAfter ?? 10}s.`
        );
        return;
      }
      if (!res.ok) throw new Error();
      const d = await res.json();
      setMsgs((m) => m.map((x) => (x.id === temp.id ? d.message : x)));
      void load();
    } catch (e) {
      setMsgs((m) => m.filter((x) => x.id !== temp.id));
      toast.error(
        e instanceof Error && /quota|daily-quota/.test(e.message)
          ? "Daily upload limit reached — try again tomorrow."
          : "Voice note not sent"
      );
    } finally {
      sendingVoiceRef.current = false;
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

  function onRowTap(e: ReactMouseEvent, id: string) {
    const t = e.target as HTMLElement;
    if (t.closest("button, a, textarea, input, [role='toolbar']")) return;
    setActiveMsgId((cur) => (cur === id ? null : id));
  }

  function startReply(m: Msg) {
    setReplyTo(m);
    setActiveMsgId(null);
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

  function groupedWithPrev(idx: number): boolean {
    if (idx === 0) return false;
    const prev = msgs[idx - 1];
    const cur = msgs[idx];
    if (prev.deleted || cur.deleted) return false;
    if (prev.kind === "sticker" || cur.kind === "sticker") return false;
    if (prev.kind === "voice" || cur.kind === "voice") return false;
    if (cur.replyTo) return false;
    if (prev.mine !== cur.mine) return false;
    const gap =
      new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime();
    return gap >= 0 && gap < GROUP_GAP_MS;
  }

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden",
        C.bg,
        C.text
      )}
    >
      <div
        ref={scrollRef}
        onScroll={onThreadScroll}
        onClick={(e) => {
          if (e.target === e.currentTarget) setActiveMsgId(null);
        }}
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
            {canOlder && msgs.length > 0 && (
              <div className="flex justify-center px-4 pb-2">
                <button
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  className="rounded-full border border-[#2b2d31] bg-[#1e1f22] px-4 py-1.5 text-[12px] font-medium text-[#B5BAC1] transition-colors hover:bg-[#2b2d31] disabled:opacity-60"
                >
                  {loadingOlder ? "Loading…" : "Load older messages"}
                </button>
              </div>
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
                    "pointer-events-none translate-y-1 opacity-0 transition-all duration-150",
                    "group-hover:pointer-events-auto group-hover:translate-y-[-50%] group-hover:opacity-100",
                    "group-focus-within:pointer-events-auto group-focus-within:translate-y-[-50%] group-focus-within:opacity-100",
                    activeMsgId === m.id &&
                      "[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-y-[-50%] [@media(hover:none)]:opacity-100"
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
                      {m.kind !== "voice" && (
                        <button
                          onClick={() => {
                            setEditDraft(m.body);
                            setEditingId(m.id);
                            setActiveMsgId(null);
                            setConfirmDeleteId(null);
                          }}
                          aria-label="Edit message"
                          title="Edit"
                          className="flex h-6 w-6 items-center justify-center rounded sm:h-7 sm:w-7 text-[#B5BAC1] transition-colors hover:bg-white/10 hover:text-[#5865F2]"
                        >
                          <Pencil size={14} className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        </button>
                      )}
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

              if (m.kind === "sticker") {
                return (
                  <div
                    key={m.id}
                    id={`dm-msg-${m.id}`}
                    onClick={(e) => onRowTap(e, m.id)}
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

              if (compact) {
                return (
                  <div
                    key={m.id}
                    id={`dm-msg-${m.id}`}
                    onClick={(e) => onRowTap(e, m.id)}
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
                        className="w-10 shrink-0 select-none whitespace-nowrap overflow-hidden text-right text-[10px] tabular-nums text-transparent transition-colors group-hover:text-[#949BA4]"
                        aria-hidden
                      >
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
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

              return (
                <div
                  key={m.id}
                  id={`dm-msg-${m.id}`}
                  onClick={(e) => onRowTap(e, m.id)}
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
                      ) : m.kind === "voice" && m.sending ? (
                        <span className="block min-w-[220px] max-w-[280px]">
                          <span className="flex min-w-0 items-center gap-2 py-1" aria-label="Sending voice note">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4E5058] text-white">
                              <LoaderCircle size={14} className="animate-spin" />
                            </span>
                            <span className="flex min-w-0 flex-1 items-end gap-[2px]" aria-hidden>
                              {(m.attachment?.peaks && m.attachment.peaks.length > 0
                                ? m.attachment.peaks
                                : new Array(28).fill(0.4)
                              ).map((p, i) => (
                                <span
                                  key={i}
                                  style={{ height: `${4 + Math.min(1, Math.max(0, p)) * 20}px` }}
                                  className="w-full min-w-[2px] rounded-full bg-[#4E5058]"
                                />
                              ))}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#949BA4]">
                              Sending…
                            </span>
                          </span>
                        </span>
                      ) : m.kind === "voice" && m.attachment?.url ? (
                        <span className="block min-w-[220px] max-w-[280px]">
                          <VoicePlayer
                            url={m.attachment.url}
                            duration={m.attachment.duration}
                            peaks={m.attachment.peaks}
                          />
                          {m.edited && (
                            <span className="ml-1 align-baseline text-[11px] text-[#949BA4]">
                              (edited)
                            </span>
                          )}
                        </span>
                      ) : m.kind === "voice" ? (
                        <p className="text-[13px] italic text-[#949BA4]">
                          🎤 Voice message unavailable
                        </p>
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
        {!voicing && (
          <EmojiPicker onEmoji={(e) => setDraft((d) => takeGraphemes(d + e, 500))} />
        )}

        <label htmlFor="dm-input" className="sr-only">
          Message
        </label>
        {!voicing && (
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
            className="min-h-9 w-full rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-4 py-[7px] pr-16 text-[14px] leading-5 text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
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
        )}
        {!voicing && (
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            suppressHydrationWarning
            className="h-9 rounded-[2px] bg-[#FAFAFA] px-5 text-[14px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] disabled:opacity-30"
          >
            Send
          </button>
        )}
        <VoiceRecorder
          disabled={busy}
          onReady={(clip) => void sendVoice(clip)}
          onPreviewing={onPreviewing}
        />
      </form>
    </div>
  );
}
