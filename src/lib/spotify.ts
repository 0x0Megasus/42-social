import type { UserSpotify } from "@/lib/db";


export type SpotifyKind = "track" | "artist";

const ID_RE = /^[A-Za-z0-9]{22}$/;

function cleanId(id: string): string | null {
  const t = id.trim();
  return ID_RE.test(t) ? t : null;
}

export function parseSpotifyUrl(input: unknown): {
  kind: SpotifyKind;
  id: string;
} | null {
  if (typeof input !== "string") return null;
  const t = input.trim().slice(0, 500);
  if (!t) return null;
  const uri = t.match(/^spotify:(track|artist):([A-Za-z0-9]+)\s*$/);
  if (uri) {
    const id = cleanId(uri[2]);
    return id ? { kind: uri[1] as SpotifyKind, id } : null;
  }
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "open.spotify.com")
    return null;
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs.length !== 2) return null;
  const [kind, rawId] = segs;
  if (kind !== "track" && kind !== "artist") return null;
  const id = cleanId(rawId);
  return id ? { kind, id } : null;
}

export function canonicalSpotifyUrl(kind: SpotifyKind, id: string): string {
  return `https://open.spotify.com/${kind}/${id}`;
}

export function embedSpotifyUrl(kind: SpotifyKind, id: string): string {
  return `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`;
}

export function spotifySearchUrl(query: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(query.trim().slice(0, 100))}`;
}


export type SpotifySearchResult = {
  kind: SpotifyKind;
  id: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  url: string;
};

type TokenCache = { access: string; exp: number };
let tokenCache: TokenCache | null = null;

function spotifyCreds(): { id: string; secret: string } | null {
  const id = process.env.SPOTIFY_CLIENT_ID ?? "";
  const secret = process.env.SPOTIFY_CLIENT_SECRET ?? "";
  return id && secret ? { id, secret } : null;
}

export function spotifySearchAvailable(): boolean {
  return spotifyCreds() !== null;
}

async function searchToken(): Promise<string | null> {
  const creds = spotifyCreds();
  if (!creds) return null;
  if (tokenCache && Date.now() < tokenCache.exp - 60_000)
    return tokenCache.access;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    if (!d?.access_token) return null;
    tokenCache = {
      access: d.access_token,
      exp: Date.now() + (d.expires_in ?? 3600) * 1000,
    };
    return tokenCache.access;
  } catch {
    return null;
  }
}

function pickImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const urls = (images as { url?: unknown }[])
    .map((i) => i?.url)
    .filter((u): u is string => typeof u === "string" && !!u);
  return urls.length > 0 ? urls[urls.length - 1].slice(0, 500) : null;
}

export function mapSpotifySearch(json: unknown): SpotifySearchResult[] {
  const out: SpotifySearchResult[] = [];
  const root = (json ?? {}) as {
    tracks?: { items?: unknown[] };
    artists?: { items?: unknown[] };
  };
  for (const raw of root.tracks?.items ?? []) {
    const t = raw as {
      id?: unknown;
      name?: unknown;
      artists?: { name?: unknown }[];
      album?: { images?: unknown };
    };
    if (typeof t?.id !== "string" || !ID_RE.test(t.id)) continue;
    const names = Array.isArray(t.artists)
      ? t.artists
          .map((a) => a?.name)
          .filter((n): n is string => typeof n === "string" && !!n)
      : [];
    out.push({
      kind: "track",
      id: t.id,
      title:
        typeof t.name === "string" && t.name ? t.name.slice(0, 200) : "Unknown",
      subtitle: names[0] ?? null,
      image: pickImage(t.album?.images),
      url: canonicalSpotifyUrl("track", t.id),
    });
  }
  for (const raw of root.artists?.items ?? []) {
    const a = raw as { id?: unknown; name?: unknown; images?: unknown };
    if (typeof a?.id !== "string" || !ID_RE.test(a.id)) continue;
    out.push({
      kind: "artist",
      id: a.id,
      title:
        typeof a.name === "string" && a.name ? a.name.slice(0, 200) : "Unknown",
      subtitle: "Artist",
      image: pickImage(a.images),
      url: canonicalSpotifyUrl("artist", a.id),
    });
  }
  return out.slice(0, 10);
}

export async function searchSpotify(query: string): Promise<SpotifySearchResult[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const token = await searchToken();
  if (!token) throw new Error("unavailable");
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track,artist&limit=10`,
    {
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${token}` },
    }
  ).catch(() => null);
  if (!res || !res.ok) throw new Error("unavailable");
  return mapSpotifySearch(await res.json().catch(() => null));
}

type OEmbed = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

async function fetchMeta(
  url: string
): Promise<{ title: string | null; subtitle: string | null; image: string | null }> {
  const empty = { title: null, subtitle: null, image: null };
  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json" },
      }
    );
    if (!res.ok) return empty;
    const d = (await res.json().catch(() => null)) as OEmbed | null;
    if (!d || typeof d !== "object") return empty;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
    const title = str(d.title);
    let subtitle = str(d.author_name);
    if (subtitle && title && subtitle.toLowerCase() === title.toLowerCase())
      subtitle = null;
    return { title, subtitle, image: str(d.thumbnail_url) };
  } catch {
    return empty;
  }
}

export async function resolveSpotify(
  input: unknown
): Promise<UserSpotify | null> {
  const parsed = parseSpotifyUrl(input);
  if (!parsed) return null;
  const url = canonicalSpotifyUrl(parsed.kind, parsed.id);
  const meta = await fetchMeta(url);
  return {
    kind: parsed.kind,
    id: parsed.id,
    url,
    title: meta.title,
    subtitle: meta.subtitle,
    image: meta.image,
  };
}
