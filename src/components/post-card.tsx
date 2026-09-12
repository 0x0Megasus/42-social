"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Pencil, Trash2, Check, X, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmojiPicker, kickColor } from "@/components/emoji-picker";
import { Quote } from "@/components/quote";
import { renderRich, stripMarkup } from "@/components/rich-text";
import { StatusDot } from "@/components/presence";
import { timeAgo } from "@/lib/format";
import type { QuotedReply } from "@/lib/db";
import { toast } from "sonner";

export type FeedPost = {
  id: string;
  body: string;
  image: string | null;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  likes: number;
  comments: number;
  liked: boolean;
  author: {
    id: string;
    name: string;
    login42: string | null;
    avatar: string | null;
    campus: string | null;
  } | null;
};

export function Avatar({
  name,
  src,
  size = 40,
  online,
}: {
  name: string;
  src: string | null;
  size?: number;
  online?: boolean | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const dot =
    online === undefined ? null : (
      <StatusDot online={online} size={Math.max(10, size * 0.3)} />
    );
  if (!src)
    return (
      <span
        aria-hidden
        className="relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-zinc-700 font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {name.slice(0, 1).toUpperCase()}
        {dot}
      </span>
    );
  return (
    <span
      className="relative block shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        {/* placeholder: initial while image loads */}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-cyan-400 to-zinc-700 font-bold text-white"
          style={{ fontSize: size * 0.4 }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      </span>
      {dot}
    </span>
  );
}

export type CommentAuthor = {
  id?: string;
  name: string;
  login42?: string | null;
};

export type FeedComment = {
  id: string;
  body: string;
  kind?: "text" | "sticker";
  edited?: boolean;
  deleted?: boolean;
  replyTo?: QuotedReply;
  createdAt?: string;
  author: CommentAuthor | null;
};

export function PostCard({
  post,
  onUpdate,
  open,
  onToggle,
  focused,
  meName,
  meId,
}: {
  post: FeedPost;
  onUpdate?: (id: string, patch: Partial<FeedPost>) => void;
  open?: boolean;
  onToggle?: () => void;
  focused?: boolean;
  meName?: string;
  meId?: string;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  function setIsOpen(v: boolean) {
    if (open !== undefined) {
      if (v !== open) onToggle?.();
    } else {
      setInnerOpen(v);
    }
  }
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleLike() {
    const prev = liked;
    const prevCount = likes;
    setLiked(!prev); // optimistic
    setLikes((n) => n + (prev ? -1 : 1));
    try {
      const res = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        if (res.status === 429) {
          const d = await res.json().catch(() => ({}));
          toast.error(`Slow down — try again in ${d?.retryAfter ?? 10}s.`);
        } else {
          toast.error("Like failed");
        }
        setLiked(prev);
        setLikes(prevCount);
        return;
      }
      const d = await res.json();
      setLiked(d.liked);
      setLikes(d.likes);
      onUpdate?.(post.id, { liked: d.liked, likes: d.likes });
    } catch {
      setLiked(prev);
      setLikes(prevCount);
      toast.error("Like failed");
    }
  }

  async function loadComments() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/comments?postId=${post.id}`);
      const d = await res.json();
      const list = d.comments ?? [];
      setComments(list);
      onUpdate?.(post.id, { comments: list.length });
      // open at the latest comments
      requestAnimationFrame(() => scrollChatToBottom(false));
    } catch {
      /* keep closed on failure */
      setIsOpen(false);
    } finally {
      setLoadingComments(false);
    }
  }

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    await postComment(draft);
  }

  async function postComment(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    // optimistic line (carries the reply snapshot so the quote shows instantly)
    const replySnap: QuotedReply = replyTo
      ? {
          id: replyTo.id,
          body:
            replyTo.kind === "sticker"
              ? "Sticker"
              : replyTo.body.slice(0, 120),
          name: replyTo.author?.name ?? "?",
          senderId: replyTo.author?.id ?? "",
        }
      : null;
    const temp = {
      id: `tmp-${Date.now()}`,
      body: clean,
      kind: "text" as const,
      replyTo: replySnap,
      author: { name: meName ?? "You" },
    };
    setComments((c) => [...c, temp]);
    setDraft("");
    setReplyTo(null);
    requestAnimationFrame(() => scrollChatToBottom());
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: post.id,
          body: clean,
          replyToId: replySnap?.id.startsWith("tmp-")
            ? undefined
            : replySnap?.id,
        }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        setComments((c) => c.filter((x) => x.id !== temp.id));
        toast.error(
          d?.error === "duplicate"
            ? "Duplicate comment — say something new."
            : `Slow down — try again in ${d?.retryAfter ?? 3}s.`
        );
        return;
      }
      const d = await res.json();
      // NOTE: both setStates run sequentially in the handler — never nest
      // one component's setState inside another's updater (impure updater).
      setComments((c) => c.map((x) => (x.id === temp.id ? d.comment : x)));
      if (typeof d.total === "number") onUpdate?.(post.id, { comments: d.total });
    } catch {
      setComments((c) => c.filter((x) => x.id !== temp.id));
      toast.error("Comment failed");
    } finally {
      setBusy(false);
    }
  }

  const [editingPost, setEditingPost] = useState(false);
  const [postDraft, setPostDraft] = useState(post.body);
  // Local overrides: instant feedback even where no onUpdate is wired (profile).
  // Cleared automatically once fresh props arrive (see effect below).
  const [bodyOverride, setBodyOverride] = useState<string | null>(null);
  const [editedOverride, setEditedOverride] = useState(false);
  const [gone, setGone] = useState(false);
  const [confirmDeletePost, setConfirmDeletePost] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState("");
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<
    string | null
  >(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [flashComment, setFlashComment] = useState<string | null>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  function scrollChatToBottom(smooth = true) {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setShowJump(false);
  }

  function onChatScroll() {
    const el = chatRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  }

  function jumpToComment(id: string) {
    const el = document.getElementById(`cmt-${post.id}-${id}`);
    if (!el) {
      toast.info("Original comment isn't loaded here.");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashComment(id);
    setTimeout(
      () => setFlashComment((f) => (f === id ? null : f)),
      1200
    );
  }

  function startReply(c: FeedComment) {
    setReplyTo(c);
    replyInputRef.current?.focus({ preventScroll: true });
  }

  const isMine = !!meId && post.author?.id === meId && !post.deleted;

  async function savePostEdit() {
    const clean = postDraft.trim().slice(0, 500);
    if (!clean || clean === post.body) {
      setEditingPost(false);
      return;
    }
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: clean }),
      });
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        toast.error(`Slow down — try again in ${d?.retryAfter ?? 30}s.`);
        return;
      }
      if (!res.ok) throw new Error();
      const d = await res.json();
      onUpdate?.(post.id, {
        body: d.post.body,
        edited: true,
        likes: d.post.likes,
        comments: d.post.comments,
      });
      setBodyOverride(d.post.body);
      setEditedOverride(true);
      setEditingPost(false);
      setConfirmDeletePost(false);
      toast.success("Post updated");
    } catch {
      toast.error("Edit failed");
    }
  }

  async function deletePost() {
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const d = await res.json();
      onUpdate?.(post.id, { deleted: true, likes: d.post.likes });
      setGone(true);
      setConfirmDeletePost(false);
      setIsOpen(false);
    } catch {
      toast.error("Delete failed");
    }
  }

  async function saveCommentEdit(id: string) {
    const clean = editCommentDraft.trim().slice(0, 300);
    if (!clean) return;
    const prev = comments.find((c) => c.id === id);
    setComments((cs) =>
      cs.map((x) => (x.id === id ? { ...x, body: clean, edited: true } : x))
    );
    setEditingCommentId(null);
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: clean }),
      });
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        if (prev)
          setComments((cs) => cs.map((x) => (x.id === id ? prev : x)));
        toast.error(`Slow down — try again in ${d?.retryAfter ?? 10}s.`);
        return;
      }
      if (!res.ok) throw new Error();
      // API returns the flat comment ({...fields, author, total}) — NOT nested.
      const d = await res.json();
      const updated: FeedComment = {
        id: d.id ?? id,
        body: d.body ?? clean,
        kind: d.kind ?? "text",
        edited: !!d.edited,
        deleted: !!d.deleted,
        createdAt: d.createdAt,
        author: d.author ?? prev?.author ?? null,
      };
      setComments((cs) => cs.map((x) => (x.id === id ? updated : x)));
      if (typeof d.total === "number")
        onUpdate?.(post.id, { comments: d.total });
    } catch {
      if (prev)
        setComments((cs) => cs.map((x) => (x.id === id ? prev : x)));
      toast.error("Edit failed");
    }
  }

  async function deleteComment(id: string) {
    const prev = [...comments];
    // deleted comments vanish entirely — no tombstone
    setComments((cs) => cs.filter((x) => x.id !== id));
    setConfirmDeleteCommentId(null);
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (typeof d.total === "number")
        onUpdate?.(post.id, { comments: d.total });
    } catch {
      setComments(prev);
      toast.error("Delete failed");
    }
  }

  const handle = post.author?.login42 ?? post.author?.name ?? "student";

  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focused) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focused]);

  // Fresh props arrived (poll / revalidate) — drop local overrides.
  useEffect(() => {
    setBodyOverride(null);
    setEditedOverride(false);
  }, [post.body, post.edited]);

  // Deleted posts vanish entirely — no tombstone, anywhere.
  if (post.deleted || gone) return null;

  const displayBody = bodyOverride ?? post.body;
  const displayEdited = post.edited || editedOverride;

  return (
    <article
      ref={cardRef}
      id={`post-${post.id}`}
      className={cn(
        "group scroll-mt-20 rounded-2xl border bg-white p-4 transition-colors dark:bg-zinc-950",
        focused
          ? "border-cyan-400 ring-2 ring-cyan-400/40 dark:border-cyan-500"
          : "border-zinc-200 dark:border-zinc-800"
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar name={post.author?.name ?? "?"} src={post.author?.avatar ?? null} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/profile/${handle}`}
            className="block truncate text-[14px] font-semibold hover:underline"
          >
            {post.author?.name ?? "Unknown"}
          </Link>
          <p className="truncate text-xs text-zinc-500">
            @{handle}
            {post.author?.campus ? ` · ${post.author.campus}` : ""} ·{" "}
            {timeAgo(post.createdAt)}
            {displayEdited && " · Edited"}
          </p>
        </div>
        {isMine && !editingPost && (
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
            {confirmDeletePost ? (
              <>
                <button
                  onClick={deletePost}
                  aria-label="Confirm delete post"
                  title="Confirm delete"
                  className="rounded-full p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Check size={15} />
                </button>
                <button
                  onClick={() => setConfirmDeletePost(false)}
                  aria-label="Cancel delete"
                  className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X size={15} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setPostDraft(bodyOverride ?? post.body);
                    setEditingPost(true);
                    setConfirmDeletePost(false);
                  }}
                  aria-label="Edit post"
                  title="Edit"
                  className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setConfirmDeletePost(true)}
                  aria-label="Delete post"
                  title="Delete"
                  className="rounded-full p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </span>
        )}
      </div>
      {editingPost ? (
        <div className="mt-3">
          <label htmlFor={`edit-post-${post.id}`} className="sr-only">
            Edit post
          </label>
          <textarea
            id={`edit-post-${post.id}`}
            value={postDraft}
            onChange={(e) => setPostDraft(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            className="w-full resize-none rounded-xl border border-zinc-200 bg-transparent p-2 text-[15px] leading-6 outline-none focus:border-cyan-500 dark:border-zinc-700"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setEditingPost(false)}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-[13px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              onClick={savePostEdit}
              disabled={!postDraft.trim()}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-900"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-6">{renderRich(displayBody)}</p>
      )}
      <div className="mt-3 flex items-center gap-1">
        <button
          onClick={toggleLike}
          aria-pressed={liked}
          aria-label={liked ? "Unlike post" : "Like post"}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
            liked
              ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40"
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          )}
        >
          <Heart size={16} fill={liked ? "currentColor" : "none"} />
          <span>{likes}</span>
        </button>
        <button
          onClick={loadComments}
          aria-expanded={isOpen}
          aria-label="Comments"
          className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <MessageCircle size={16} />
          <span>{post.comments}</span>
        </button>
      </div>
      {isOpen && (
        <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          {/* Kick-style chat: compact rows, colored names, viewport-capped */}
          <div className="relative">
          <div
            ref={chatRef}
            onScroll={onChatScroll}
            role="log"
            aria-label="Comments"
            className="max-h-[45dvh] space-y-0.5 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
          >
            {loadingComments ? (
              <div
                role="status"
                aria-label="Loading comments"
                className="space-y-1.5 px-1 py-1"
              >
                {[85, 65, 75].map((w, i) => (
                  <div
                    key={i}
                    aria-hidden
                    className="h-4 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            ) : (
              <>
                {comments.length === 0 && (
                  <p className="px-1 py-2 text-[13px] text-zinc-400">
                    No comments yet — be the first to comment.
                  </p>
                )}
                {comments.map((c) => {
              if (!c) return null;
              const who = c.author?.name ?? "?";
              const handle = c.author?.login42 ?? c.author?.name ?? null;
              const mine = !!meId && !!c.author?.id && c.author.id === meId;
              const nameNode = handle ? (
                <Link
                  href={`/profile/${encodeURIComponent(handle)}`}
                  className="font-bold hover:underline"
                  style={{ color: kickColor(who) }}
                >
                  {who}
                </Link>
              ) : (
                <span className="font-bold" style={{ color: kickColor(who) }}>
                  {who}
                </span>
              );
              // deleted comments are filtered server-side; guard stays for safety
              if (c.deleted) return null;
              if (c.kind === "sticker") {
                return (
                  <div key={c.id} className="flex items-center gap-2 px-1 py-1">
                    {nameNode}
                    <span className="text-[13px] text-zinc-500">:</span>
                    <span className="text-4xl leading-none">{c.body}</span>
                  </div>
                );
              }
              const isEditing = editingCommentId === c.id;
              return (
                <div
                  key={c.id}
                  id={`cmt-${post.id}-${c.id}`}
                  className={cn(
                    "scroll-mt-2 overflow-hidden rounded px-1 py-1 text-[13.5px] leading-5 break-words hover:bg-zinc-100 dark:hover:bg-zinc-900",
                    flashComment === c.id && "bg-orange-200/70 dark:bg-orange-500/15"
                  )}
                >
                  {c.replyTo && !isEditing && (
                    <Quote
                      name={c.replyTo.name}
                      body={c.replyTo.body}
                      mine={!!meId && c.replyTo.senderId === meId}
                      onJump={() => jumpToComment(c.replyTo!.id)}
                    />
                  )}
                  {nameNode}
                  <span className="text-zinc-500">: </span>
                  {isEditing ? (
                    <span className="mt-1 block">
                      <input
                        value={editCommentDraft}
                        onChange={(e) => setEditCommentDraft(e.target.value)}
                        maxLength={300}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveCommentEdit(c.id);
                          }
                          if (e.key === "Escape") setEditingCommentId(null);
                        }}
                        className="h-8 w-full rounded-lg border border-zinc-200 bg-transparent px-2 text-[13.5px] outline-none focus:border-cyan-500 dark:border-zinc-700"
                      />
                      <span className="mt-1 flex gap-1">
                        <button
                          onClick={() => saveCommentEdit(c.id)}
                          aria-label="Save edit"
                          className="rounded-full p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingCommentId(null)}
                          aria-label="Cancel edit"
                          className="rounded-full p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    </span>
                  ) : (
                    <span>{c.body}</span>
                  )}
                  {c.edited && !isEditing && (
                    <span className="ml-1 text-[11px] italic text-zinc-400">
                      (edited)
                    </span>
                  )}
                  {c.createdAt && (
                    <span className="ml-2 text-[11px] text-zinc-400">
                      {timeAgo(c.createdAt)}
                    </span>
                  )}
                  {!isEditing && !c.id.startsWith("tmp-") && (
                    <button
                      onClick={() => startReply(c)}
                      aria-label="Reply to comment"
                      className="ml-2 text-[11px] font-semibold text-zinc-400 opacity-0 transition-opacity hover:text-[#5865F2] group-hover/c:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                    >
                      Reply
                    </button>
                  )}
                  {mine && !isEditing && !c.id.startsWith("tmp-") && (
                    <span className="ml-1 inline-flex items-center gap-0.5 align-middle opacity-0 transition-opacity group-hover/c:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                      {confirmDeleteCommentId === c.id ? (
                        <>
                          <button
                            onClick={() => deleteComment(c.id)}
                            aria-label="Confirm delete"
                            title="Confirm delete"
                            className="rounded-full p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteCommentId(null)}
                            aria-label="Cancel delete"
                            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditCommentDraft(c.body);
                              setEditingCommentId(c.id);
                              setConfirmDeleteCommentId(null);
                            }}
                            aria-label="Edit comment"
                            title="Edit"
                            className="rounded-full p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteCommentId(c.id)}
                            aria-label="Delete comment"
                            title="Delete"
                            className="rounded-full p-1 text-zinc-400 hover:text-rose-500"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
              </>
            )}
          </div>
          {showJump && !loadingComments && (
            <button
              onClick={() => scrollChatToBottom()}
              aria-label="Scroll to latest comments"
              className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-opacity hover:opacity-85 dark:bg-zinc-50 dark:text-zinc-900"
            >
              <ArrowDown size={13} /> Latest
            </button>
          )}
          </div>
          {replyTo && (
            <div className="flex items-center gap-2 pt-2">
              <span className="min-w-0 flex-1 truncate rounded border-l-2 border-[#5865F2] bg-[#5865F2]/10 px-2 py-1 text-xs">
                <b className="text-[#5865F2]">
                  Replying to {replyTo.author?.name ?? "?"}
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
          <form onSubmit={sendComment} className="flex items-center gap-1 pt-2">
            <EmojiPicker onEmoji={(e) => setDraft((d) => (d + e).slice(0, 300))} />
            <label htmlFor={`reply-${post.id}`} className="sr-only">
              Chat a reply
            </label>
            <input
              ref={replyInputRef}
              id={`reply-${post.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Chat…"
              maxLength={300}
              className="h-9 min-w-0 flex-1 rounded-full border border-zinc-200 bg-transparent px-3 text-[14px] outline-none focus:border-cyan-500 dark:border-zinc-700"
            />
            <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
              {draft.length}/300
            </span>
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              className="h-9 cursor-pointer rounded-full bg-zinc-900 px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-900"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
