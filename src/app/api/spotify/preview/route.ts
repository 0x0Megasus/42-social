import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { resolveSpotify } from "@/lib/spotify";

// POST /api/spotify/preview { url } -> { spotify } | 400
// Verifies a pasted track/artist link before the user saves it: parses the
// kind+id and fills title/artist/cover via Spotify's public oEmbed
// endpoint (no keys, no OAuth). Metadata is best-effort — a parseable link
// with dead metadata still resolves (id+url always work in the embed).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`spotify:${session.sub}`, 20, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const { url } = (await req.json().catch(() => ({}))) as {
    url?: string;
  };
  const spotify = await resolveSpotify(url);
  if (!spotify)
    return NextResponse.json(
      { error: "invalid — paste a Spotify song or artist link" },
      { status: 400 }
    );
  return NextResponse.json({ spotify });
}
