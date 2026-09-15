import { NextResponse } from "next/server";
import { pushToCollection, readUserById, uid } from "@/lib/db";
import { isSupportUser } from "@/lib/support";
import { getSession } from "@/lib/session";
import { rateLimit, isDuplicate } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";
import { getFeedPage } from "@/lib/feed";
import { ensureCountersBackfilled, bumpUserCounter } from "@/lib/counters";
import { isCloudinaryUrl } from "@/lib/cloudinary";
import { after } from "next/server";

// GET /api/posts?limit&offset -> { posts, hasMore }
// One ranked feed (Facebook-style pipeline in lib/feed-rank.ts): recency
// is a signal, not a separate tab. Short private cache: browsers serve
// the 10s poll + StrictMode double-fetch from cache while mutations
// revalidate explicitly.
export async function GET(req: Request) {
  const session = await getSession();
  const q = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(q.get("limit")) || 20, 1), 50);
  const offset = Math.max(Number(q.get("offset")) || 0, 0);
  // Self-healing counters for pre-denormalization rows — runs after the
  // response so it never slows the feed.
  after(() => ensureCountersBackfilled());
  const page = await getFeedPage({
    meId: session?.sub ?? null,
    limit,
    offset,
  });
  return NextResponse.json(page, {
    headers: {
      "Cache-Control": "private, max-age=5, stale-while-revalidate=15",
    },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { body, image, thumb, video, cloudIds, imgW, imgH } = (await req.json().catch(
    () => ({})
  )) as {
    body?: string;
    image?: string;
    thumb?: string;
    cloudIds?: string[];
    imgW?: number;
    imgH?: number;
    video?: {
      url?: string;
      thumb?: string | null;
      w?: number | null;
      h?: number | null;
      duration?: number | null;
      bytes?: number | null;
    } | null;
  };
  const text = clean(body, 500);
  // Text, image, or video required (media-only posts allowed).
  // Media URLs must be our own Cloudinary deliveries (no hotlinking).
  const cleanUrl = (u: unknown): string | null =>
    typeof u === "string" && isCloudinaryUrl(u) && u.length <= 2000
      ? u
      : null;
  const cleanImage = cleanUrl(image);
  const cleanThumb = cleanUrl(thumb);
  let cleanVideo: {
    url: string;
    thumb: string | null;
    w: number | null;
    h: number | null;
    duration: number | null;
    bytes: number | null;
  } | null = null;
  if (video && typeof video === "object") {
    const url = cleanUrl(video.url);
    if (!url) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const duration = num(video.duration);
    const bytes = num(video.bytes);
    if (
      (duration !== null && (duration < 0 || duration > 65)) ||
      (bytes !== null && (bytes < 0 || bytes > 60 * 1024 * 1024))
    )
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    cleanVideo = {
      url,
      thumb: video.thumb ? cleanUrl(video.thumb) : null,
      w: num(video.w),
      h: num(video.h),
      duration,
      bytes,
    };
  }
  if (!text && !cleanImage && !cleanVideo)
    return NextResponse.json({ error: "empty" }, { status: 400 });
  const dim = (v: unknown): number | null =>
    typeof v === "number" &&
    Number.isFinite(v) &&
    v > 0 &&
    v <= 10000
      ? Math.round(v)
      : null;
  // public_ids must live under the caller's prefix (destroy rights).
  const cleanIds =
    Array.isArray(cloudIds)
      ? cloudIds.filter(
          (id): id is string =>
            typeof id === "string" &&
            id.startsWith(`42social/${session.sub}/`)
        ).slice(0, 4)
      : [];

  // Max 5 posts / 5 min, no repeat text / 5 min.
  const vol = rateLimit(`post-vol:${session.sub}`, 5, 300_000);
  if (!vol.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: vol.retryAfter },
      { status: 429, headers: { "Retry-After": String(vol.retryAfter) } }
    );
  if (text && isDuplicate(`post-dupe:${session.sub}`, text, 300_000))
    return NextResponse.json({ error: "duplicate" }, { status: 429 });

  const me = await readUserById(session.sub);
  const post = await pushToCollection("posts", {
    id: uid("p"),
    authorId: session.sub,
    body: text,
    image: cleanImage,
    thumb: cleanThumb,
    imgW: dim(imgW),
    imgH: dim(imgH),
    video: cleanVideo,
    cloudIds: cleanIds.length > 0 ? cleanIds : null,
    edited: false,
    deleted: false,
    createdAt: new Date().toISOString(),
    author: me
      ? {
          id: me.id,
          name: me.name,
          login42: me.login42 ?? null,
          avatar: me.avatar ?? null,
          campus: me.campus ?? null,
          isSupport: isSupportUser(me),
        }
      : null,
    likesCount: 0,
    commentsCount: 0,
  });
  // Author post counter (exact recompute would scan /posts; a +1 leaf bump
  // is exact here since we just added exactly one).
  await bumpUserCounter(session.sub, "postsCount", 1).catch(() => null);
  return NextResponse.json({ post }, { status: 201 });
}
