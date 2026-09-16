import { NextResponse } from "next/server";
import {
  bustUserCache,
  indexUserHandles,
  readCollectionEntries,
  readUserById,
  updatePaths,
  userPublic,
  writeUserById,
} from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clean } from "@/lib/sanitize";
import { resolveCoverUrl } from "@/lib/cover";
import { resolveSpotify } from "@/lib/spotify";

const ALLOWED_LABELS = new Set(["github", "linkedin", "instagram", "x"]);

function normalizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    // try adding https://
    try {
      const u2 = new URL(`https://${trimmed}`);
      return u2.toString();
    } catch {
      return null;
    }
  }
}

function normalizeSocials(input: unknown): { label: string; url: string }[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: { label: string; url: string }[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const rawLabel = typeof (item as Record<string, unknown>).label === "string" ? String((item as Record<string, unknown>).label).trim() : "";
    const rawUrl = typeof (item as Record<string, unknown>).url === "string" ? String((item as Record<string, unknown>).url).trim() : "";
    if (!rawLabel || !rawUrl) continue;
    const lower = rawLabel.toLowerCase();
    if (!ALLOWED_LABELS.has(lower)) continue;
    if (seen.has(lower)) continue;
    const norm = normalizeUrl(rawUrl);
    if (!norm) continue;
    seen.add(lower);
    // canonical label is lower case as in ALLOWED_LABELS
    out.push({ label: lower, url: norm });
    if (out.length >= 4) break;
  }
  return out;
}

// PATCH /api/profile { name, bio, socials, cover?, spotifyUrl? } — edit your
// own nickname + bio + socials + cover banner + favorite song/artist.
// cover: undefined = untouched, "" = remove, otherwise a direct https image
// link or a Pinterest pin link (resolved server-side via og:image).
// spotifyUrl: undefined = untouched, "" = remove, otherwise a Spotify
// track/artist link or URI (resolved server-side; 400 when it isn't one).
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`prof:${session.sub}`, 10, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter) } }
    );
  const { name, bio, socials, cover, spotifyUrl } = (await req.json().catch(
    () => ({})
  )) as {
    name?: string;
    bio?: string;
    socials?: unknown;
    cover?: string;
    spotifyUrl?: string;
  };
  const cleanName = clean(name, 30);
  const cleanBio = clean(bio, 160);
  if (cleanName.length < 2)
    return NextResponse.json(
      { error: "Name needs at least 2 characters." },
      { status: 400 }
    );
  const normalized = normalizeSocials(socials);
  let resolvedCover: Awaited<ReturnType<typeof resolveCoverUrl>> | undefined;
  if (cover !== undefined) {
    resolvedCover = await resolveCoverUrl(cover);
    if (resolvedCover === null && String(cover).trim() !== "")
      return NextResponse.json({ error: "invalid-cover" }, { status: 400 });
  }
  let spotify: Awaited<ReturnType<typeof resolveSpotify>> | undefined;
  if (spotifyUrl !== undefined) {
    if (typeof spotifyUrl !== "string" || !spotifyUrl.trim()) {
      spotify = null;
    } else {
      spotify = await resolveSpotify(spotifyUrl);
      if (!spotify)
        return NextResponse.json({ error: "invalid-spotify" }, { status: 400 });
    }
  }
  const prev = await readUserById(session.sub);
  if (!prev) return NextResponse.json({ error: "not found" }, { status: 404 });
  const next = {
    ...prev,
    name: cleanName,
    bio: cleanBio,
    socials: normalized,
    nameLower: cleanName.toLowerCase(),
    ...(resolvedCover !== undefined
      ? {
          cover: resolvedCover?.image ?? null,
          coverVideo: resolvedCover?.video ?? null,
        }
      : null),
    ...(spotify !== undefined ? { spotify } : null),
  };
  // Dual-write: by-id map (O(1) reads) + legacy array leaf, addressed by
  // the real storage key (compacted findIndex is wrong once null holes
  // from deletes exist — see collectionEntries).
  await writeUserById(session.sub, next).catch(() => null);
  const entries = await readCollectionEntries("users");
  const hit = entries.find(({ row }) => row.id === session.sub);
  if (hit) {
    await updatePaths({
      [`/users/${hit.key}/name`]: cleanName,
      [`/users/${hit.key}/bio`]: cleanBio,
      [`/users/${hit.key}/socials`]: normalized,
      [`/users/${hit.key}/nameLower`]: next.nameLower,
      ...(resolvedCover !== undefined
        ? {
            [`/users/${hit.key}/cover`]: resolvedCover?.image ?? null,
            [`/users/${hit.key}/coverVideo`]: resolvedCover?.video ?? null,
          }
        : null),
      ...(spotify !== undefined
        ? { [`/users/${hit.key}/spotify`]: spotify }
        : null),
    }).catch(() => null);
  }
  await indexUserHandles(next, prev.name).catch(() => null);
  bustUserCache(session.sub);
  return NextResponse.json({ user: userPublic(next) });
}
