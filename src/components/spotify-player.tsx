"use client";

import { useState } from "react";
import { ExternalLink, Music } from "lucide-react";
import { embedSpotifyUrl, spotifySearchUrl } from "@/lib/spotify";
import type { UserSpotify } from "@/lib/db";

export function SpotifyPlayer({ spotify }: { spotify: UserSpotify }) {
  const [ready, setReady] = useState(false);
  const title =
    spotify.title ?? (spotify.kind === "track" ? "Favorite song" : "Favorite artist");
  const artistHref =
    spotify.kind === "track" && spotify.subtitle
      ? spotifySearchUrl(spotify.subtitle)
      : spotify.url;

  return (
    <section
      aria-label="Favorite music"
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="flex items-center gap-1.5 px-1 pb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-400">
        <Music size={13} /> Favorite{" "}
        {spotify.kind === "track" ? "song" : "artist"}
      </h2>
      <div className="mb-2 flex items-center gap-3 rounded-xl p-1">
        <a
          href={spotify.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open on Spotify"
          className="shrink-0"
        >
          {spotify.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={spotify.image}
              alt=""
              loading="lazy"
              className="h-12 w-12 rounded-lg object-cover hover:opacity-90"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 dark:bg-zinc-900">
              <Music size={18} />
            </span>
          )}
        </a>
        <div className="min-w-0 flex-1 text-left">
          <a
            href={spotify.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-[14px] font-semibold hover:underline"
          >
            {title}
          </a>
          {spotify.subtitle ? (
            <a
              href={artistHref}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-zinc-500 hover:text-zinc-300 hover:underline"
            >
              {spotify.subtitle}
            </a>
          ) : (
            <p className="text-xs text-zinc-500">Open in Spotify</p>
          )}
        </div>
        <a
          href={spotify.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in Spotify"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <ExternalLink size={14} />
        </a>
      </div>
      <div className="relative">
        <iframe
          title={`Spotify ${spotify.kind}: ${spotify.title ?? spotify.id}`}
          src={embedSpotifyUrl(spotify.kind, spotify.id)}
          width="100%"
          height={80}
          loading="lazy"
          allow="encrypted-media"
          onLoad={() => setReady(true)}
          className="h-20 w-full rounded-xl border-0"
        />
        {!ready && (
          <div
            aria-hidden
            className="absolute inset-0 flex items-center gap-3 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900"
          >
            <span className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <span className="flex-1 space-y-2">
              <span className="block h-3 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              <span className="block h-3 w-1/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </span>
            <span className="flex shrink-0 items-end gap-1" aria-hidden>
              <span className="w-1 animate-bounce rounded-full bg-[#1DB954] [animation-delay:0ms] [animation-duration:900ms] h-3" />
              <span className="w-1 animate-bounce rounded-full bg-[#1DB954] [animation-delay:150ms] [animation-duration:900ms] h-5" />
              <span className="w-1 animate-bounce rounded-full bg-[#1DB954] [animation-delay:300ms] [animation-duration:900ms] h-4" />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
