import { describe, expect, it } from "vitest";
import {
  canonicalSpotifyUrl,
  embedSpotifyUrl,
  mapSpotifySearch,
  parseSpotifyUrl,
  spotifySearchUrl,
} from "../spotify";

const TRACK = "4uLU6hMCjMI75M1A2tKUQ0";
const ARTIST = "06HL4z0CvFAxyc27GXKqU7";

describe("parseSpotifyUrl", () => {
  it("accepts track links (ignoring query)", () => {
    expect(
      parseSpotifyUrl(
        `https://open.spotify.com/track/${TRACK}?si=abc&utm_source=copy`
      )
    ).toEqual({ kind: "track", id: TRACK });
  });

  it("accepts artist links and URIs", () => {
    expect(
      parseSpotifyUrl(`https://open.spotify.com/artist/${ARTIST}`)
    ).toEqual({ kind: "artist", id: ARTIST });
    expect(parseSpotifyUrl(`spotify:track:${TRACK}`)).toEqual({
      kind: "track",
      id: TRACK,
    });
    expect(parseSpotifyUrl(`spotify:artist:${ARTIST}`)).toEqual({
      kind: "artist",
      id: ARTIST,
    });
  });

  it("rejects albums, playlists, pages, and garbage", () => {
    expect(
      parseSpotifyUrl(`https://open.spotify.com/album/${TRACK}`)
    ).toBeNull();
    expect(
      parseSpotifyUrl(`https://open.spotify.com/playlist/${TRACK}`)
    ).toBeNull();
    expect(parseSpotifyUrl("https://open.spotify.com/track/short")).toBeNull();
    expect(parseSpotifyUrl("https://evil.com/track/" + TRACK)).toBeNull();
    expect(parseSpotifyUrl("http://open.spotify.com/track/" + TRACK)).toBeNull();
    expect(parseSpotifyUrl("not a link")).toBeNull();
    expect(parseSpotifyUrl("")).toBeNull();
    expect(parseSpotifyUrl(null)).toBeNull();
    expect(parseSpotifyUrl(`spotify:track:${TRACK}/extra`)).toBeNull();
  });
});

describe("spotify urls", () => {
  it("builds canonical and embed urls", () => {
    expect(canonicalSpotifyUrl("track", TRACK)).toBe(
      `https://open.spotify.com/track/${TRACK}`
    );
    expect(embedSpotifyUrl("artist", ARTIST)).toBe(
      `https://open.spotify.com/embed/artist/${ARTIST}?utm_source=generator&theme=0`
    );
  });

  it("builds artist search links", () => {
    expect(spotifySearchUrl("Daft Punk")).toBe(
      "https://open.spotify.com/search/Daft%20Punk"
    );
  });
});

describe("mapSpotifySearch", () => {
  it("maps tracks and artists, skipping bad rows", () => {
    const out = mapSpotifySearch({
      tracks: {
        items: [
          {
            id: TRACK,
            name: "Get Lucky",
            artists: [{ name: "Daft Punk" }],
            album: {
              images: [
                { url: "https://i.scdn.co/big" },
                { url: "https://i.scdn.co/small" },
              ],
            },
          },
          { id: "short", name: "Bad" },
          null,
        ],
      },
      artists: {
        items: [
          {
            id: ARTIST,
            name: "Daft Punk",
            images: [{ url: "https://i.scdn.co/a" }],
          },
        ],
      },
    });
    expect(out).toEqual([
      {
        kind: "track",
        id: TRACK,
        title: "Get Lucky",
        subtitle: "Daft Punk",
        image: "https://i.scdn.co/small",
        url: `https://open.spotify.com/track/${TRACK}`,
      },
      {
        kind: "artist",
        id: ARTIST,
        title: "Daft Punk",
        subtitle: "Artist",
        image: "https://i.scdn.co/a",
        url: `https://open.spotify.com/artist/${ARTIST}`,
      },
    ]);
  });

  it("returns [] for garbage", () => {
    expect(mapSpotifySearch(null)).toEqual([]);
    expect(mapSpotifySearch({})).toEqual([]);
  });
});
