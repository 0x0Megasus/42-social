import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { searchSpotify } from "@/lib/spotify";

// GET /api/spotify/search?q= -> { results } | 503
// In-app song/artist search (Web API Client Credentials flow). Needs
// SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET in env — without them (or when
// Spotify is unreachable) it answers 503 `search-unavailable` and the UI
// falls back to paste-a-link, which needs no keys at all.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`spotify-search:${session.sub}`, 20, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results = await searchSpotify(q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "search-unavailable" }, { status: 503 });
  }
}
