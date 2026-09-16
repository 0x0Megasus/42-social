// Profile cover resolution: direct https image/GIF links pass through;
// Pinterest pin/share links are pages (no image extension), so they resolve
// server-side via the page's og:image. Anything else is rejected.

const DIRECT_RE = /\.(gif|webp|png|jpe?g)$/i;

// Only these hosts are ever fetched server-side (SSRF guard) and only
// Pinterest's own CDN output is ever accepted back.
const PIN_HOSTS = new Set([
  "pinterest.com",
  "www.pinterest.com",
  "pin.it",
  "www.pin.it",
]);
const PINIMG_HOSTS = new Set(["i.pinimg.com", "s.pinimg.com"]);

// og:image lives in <head> — cap the download instead of reading whole pages.
const MAX_SCRAPE_BYTES = 300_000;

// Pure og:image/twitter:image extraction (both attribute orders, HTML
// entities decoded). Unit-tested.
export function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const url = m[1].replace(/&amp;/g, "&").trim();
      if (url.startsWith("https://")) return url.slice(0, 2000);
    }
  }
  return null;
}

// Pinterest "GIF" pins are actually video pins — og:image is only the
// static poster. Pure og:video extraction (secure_url preferred, both
// attribute orders). Unit-tested.
export function extractOgVideo(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:video:secure_url["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:video:secure_url["']/i,
    /<meta[^>]+property=["']og:video["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:video["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const url = m[1].replace(/&amp;/g, "&").trim();
      if (url.startsWith("https://")) return url.slice(0, 2000);
    }
  }
  return null;
}

function directImageUrl(u: URL): string | null {
  if (DIRECT_RE.test(u.pathname)) return u.toString().slice(0, 2000);
  // pinimg serves uploads, sometimes extensionless — trust the host itself.
  if (PINIMG_HOSTS.has(u.hostname)) return u.toString().slice(0, 2000);
  return null;
}

// Pinterest video hosts (animated "GIF" pins are mp4s here).
const PINVIDEO_HOSTS = new Set(["v.pinimg.com"]);

function acceptCdnUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  // Only Pinterest's own CDN output — never hotlink a third party the
  // pin page happened to embed.
  if (
    !PINIMG_HOSTS.has(u.hostname) &&
    !PINVIDEO_HOSTS.has(u.hostname) &&
    !DIRECT_RE.test(u.pathname)
  )
    return null;
  return u.toString().slice(0, 2000);
}

export type ResolvedCover = {
  /** static image / poster frame (renders when no video) */
  image: string | null;
  /** animated pin content (mp4) — renders as an autoplaying cover */
  video: string | null;
};

async function resolvePinCover(pageUrl: string): Promise<ResolvedCover | null> {
  try {
    const res = await fetch(pageUrl, {
      // Never hang profile saves on Pinterest's latency or bot walls.
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      redirect: "follow",
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
        if (size >= MAX_SCRAPE_BYTES) break;
      }
    } finally {
      await reader.cancel().catch(() => null);
    }
    const total = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) {
      total.set(c, off);
      off += c.byteLength;
    }
    const html = new TextDecoder().decode(total);
    // Animated pins: og:video is the motion, og:image only its poster.
    const videoRaw = extractOgVideo(html);
    const video =
      videoRaw && PINVIDEO_HOSTS.has(safeHost(videoRaw)) ? videoRaw : null;
    const og = extractOgImage(html);
    const image = og ? acceptCdnUrl(og) : null;
    if (!image && !video) return null;
    return { image, video };
  } catch {
    return null;
  }
}

function safeHost(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}

// Full resolution: ""/non-strings → null (remove), direct image links pass
// through, Pinterest pin links resolve via og:image (+ og:video for animated
// pins — og:image alone is just the static poster), anything else → null.
export async function resolveCoverUrl(
  input: unknown
): Promise<ResolvedCover | null> {
  if (typeof input !== "string") return null;
  const t = input.trim().slice(0, 2000);
  if (!t) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const direct = directImageUrl(u);
  if (direct) return { image: direct, video: null };
  // A raw Pinterest video paste doubles as an animated cover (no poster).
  if (PINVIDEO_HOSTS.has(u.hostname))
    return { image: null, video: u.toString().slice(0, 2000) };
  if (PIN_HOSTS.has(u.hostname)) return resolvePinCover(u.toString());
  return null;
}
