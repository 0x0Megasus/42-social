"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { EmojiPicker } from "@/components/emoji-picker";
import { api } from "@/lib/api";
import { graphemeLen, takeGraphemes } from "@/lib/sanitize";
import {
  compressImage,
  formatBytes,
  formatDuration,
  mediaStatus,
  probeVideo,
  uploadFile,
} from "@/lib/media";
import { thumbUrl, videoPosterUrl } from "@/lib/cloudinary";
import type { FeedPost } from "@/components/post-card";

type Attachment =
  | {
      kind: "image";
      blob: Blob;
      w: number;
      h: number;
      preview: string;
    }
  | {
      kind: "video";
      file: File;
      duration: number | null;
      preview: string;
    };

export function Composer({
  author,
  onPosted,
}: {
  author: NonNullable<FeedPost["author"]>;
  onPosted?: (post: FeedPost) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  // Media availability (server config): the attach button only appears
  // when uploads actually work — no dead buttons, no scary errors.
  const [mediaOn, setMediaOn] = useState(false);
  useEffect(() => {
    let alive = true;
    mediaStatus()
      .then((s) => {
        if (alive) setMediaOn(s.ready);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function clearAttach() {
    if (attach) URL.revokeObjectURL(attach.preview);
    setAttach(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File) {
    if (preparing || busy || !mediaOn) return;
    setPreparing(true);
    try {
      if (file.type.startsWith("image/")) {
        const c = await compressImage(file);
        clearAttach();
        setAttach({
          kind: "image",
          blob: c.blob,
          w: c.width,
          h: c.height,
          preview: URL.createObjectURL(c.blob),
        });
      } else if (file.type.startsWith("video/")) {
        const probe = await probeVideo(file);
        if (!probe.ok) {
          toast.error(
            probe.error === "not-video"
              ? "That file isn't a video."
              : `Video too big — max 60s / 50MB (${probe.error}).`
          );
          return;
        }
        clearAttach();
        setAttach({
          kind: "video",
          file,
          duration: probe.duration ?? null,
          preview: URL.createObjectURL(file),
        });
      } else {
        toast.error("Only images and videos for now.");
      }
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === "too-large"
          ? `File too big after compression (max ${formatBytes(10 * 1024 * 1024)}).`
          : "Couldn't read that file."
      );
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if ((!text && !attach) || busy || preparing) return;
    if (!author.id) return;
    setBusy(true);
    setProgress(null);
    try {
      // Upload first (direct browser → Cloudinary), then create the post
      // with URLs. Thumbnails are derived transformation URLs — no second
      // upload, no extra storage.
      let image: string | null = null;
      let thumb: string | null = null;
      let imgW: number | null = null;
      let imgH: number | null = null;
      let video: FeedPost["video"] = null;
      const cloudIds: string[] = [];
      if (attach?.kind === "image") {
        const main = await uploadFile("posts", author.id, attach.blob, setProgress);
        image = main.url;
        thumb = thumbUrl(main.url) ?? null;
        imgW = attach.w;
        imgH = attach.h;
        cloudIds.push(main.publicId);
      } else if (attach?.kind === "video") {
        const main = await uploadFile("videos", author.id, attach.file, setProgress);
        video = {
          url: main.url,
          thumb: videoPosterUrl(main.url),
          w: main.width,
          h: main.height,
          duration: attach.duration ?? main.duration,
          bytes: main.bytes,
        };
        cloudIds.push(main.publicId);
      }
      const res = await api("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, image, thumb, imgW, imgH, video, cloudIds }),
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
      clearAttach();
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
    } catch (e) {
      toast.error(
        e instanceof Error && /quota|daily-quota/.test(e.message)
          ? "Daily upload limit reached — try again tomorrow."
          : e instanceof Error && /media-unconfigured/.test(e.message)
            ? "Uploads are unavailable right now — try again later."
            : "Couldn't post. Try again."
      );
    } finally {
      setBusy(false);
      setProgress(null);
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
        onPaste={(e) => {
          // Pasted screenshots/photos attach directly — no file dialog.
          const file = [...(e.clipboardData?.files ?? [])].find((f) =>
            /^(image|video)\//.test(f.type)
          );
          if (file) {
            e.preventDefault();
            void onFile(file);
          }
        }}
        placeholder="you.have_tought ? share() : return;"
        rows={3}
        maxLength={1000}
        className="w-full resize-none rounded-[2px] border border-zinc-300 bg-zinc-50 p-3 text-[15px] leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600"
      />
      {attach && (
        <div
          className="relative mt-3 flex items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-black"
          // Reserve the compressed image's ratio so the preview never
          // jumps or letterboxes wrong; clamped so portraits stay compact.
          // Media is always contained (never cropped) like FB/X.
          style={
            attach.kind === "image"
              ? { aspectRatio: `${attach.w} / ${attach.h}`, maxHeight: 320 }
              : undefined
          }
        >
          {attach.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attach.preview} alt="Attachment preview" className="max-h-80 w-auto max-w-full object-contain" />
          ) : (
            <video src={attach.preview} muted playsInline preload="metadata" className="max-h-80 w-auto max-w-full object-contain" />
          )}
          <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-white backdrop-blur">
            {attach.kind === "image" ? "PHOTO" : "VIDEO"}
          </span>
          <button
            type="button"
            onClick={clearAttach}
            aria-label="Remove attachment"
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition-colors hover:bg-black/85"
          >
            <X size={15} />
          </button>
          {attach.kind === "video" && attach.duration != null && (
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
              {formatDuration(attach.duration)}
            </span>
          )}
        </div>
      )}
      {progress !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-cyan-500 transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <EmojiPicker onEmoji={(e) => setBody((b) => takeGraphemes(b + e, 500))} />
          {mediaOn && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={preparing || busy}
              aria-label="Add a photo or video"
              title="Add a photo or video"
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              {preparing ? (
                <LoaderCircle size={19} className="animate-spin" />
              ) : (
                <ImagePlus size={19} />
              )}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <span className="shrink-0 text-xs tabular-nums text-zinc-400">
            {graphemeLen(body)}/500
          </span>
        </div>
        <button
          type="submit"
          disabled={(!body.trim() && !attach) || busy || preparing}
          suppressHydrationWarning
          className="h-9 shrink-0 cursor-pointer rounded-[2px] bg-zinc-900 px-5 text-[13px] font-semibold text-white hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {busy
            ? progress !== null
              ? `Uploading ${Math.round(progress * 100)}%…`
              : "Posting…"
            : "Post"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        {mediaOn
          ? "Share photos & videos — pick one or paste it straight in."
          : "Share something with campus."}
      </p>
    </form>
  );
}
