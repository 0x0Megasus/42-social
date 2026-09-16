
const DIRECT_RE = /\.(gif|webp|png|jpe?g)$/i;

const PIN_HOSTS = new Set([
  "pinterest.com",
  "www.pinterest.com",
  "pin.it",
  "www.pin.it",
]);
const PINIMG_HOSTS = new Set(["i.pinimg.com", "s.pinimg.com"]);

const MAX_SCRAPE_BYTES = 300_000;

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
  if (PINIMG_HOSTS.has(u.hostname)) return u.toString().slice(0, 2000);
  return null;
}

const PINVIDEO_HOSTS = new Set(["v.pinimg.com"]);

function acceptCdnUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (
    !PINIMG_HOSTS.has(u.hostname) &&
    !PINVIDEO_HOSTS.has(u.hostname) &&
    !DIRECT_RE.test(u.pathname)
  )
    return null;
  return u.toString().slice(0, 2000);
}

export type ResolvedCover = {
  image: string | null;
  video: string | null;
};

async function resolvePinCover(pageUrl: string): Promise<ResolvedCover | null> {
  try {
    const res = await fetch(pageUrl, {
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
  if (PINVIDEO_HOSTS.has(u.hostname))
    return { image: null, video: u.toString().slice(0, 2000) };
  if (PIN_HOSTS.has(u.hostname)) return resolvePinCover(u.toString());
  return null;
}
