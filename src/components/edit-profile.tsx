"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, LoaderCircle, Music, Pencil, Search, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { graphemeLen } from "@/lib/sanitize";
import type { UserSpotify } from "@/lib/db";
import type { SpotifySearchResult } from "@/lib/spotify";

const PRESETS = ["GitHub", "LinkedIn", "Instagram", "X"] as const;

function iconFor(_label: string) {
  return Link2;
}

export function EditProfileForm({
  name,
  bio,
  socials: initialSocials = [],
  cover: initialCover = null,
  spotify: initialSpotify = null,
}: {
  name: string;
  bio: string;
  socials?: { label: string; url: string }[];
  cover?: string | null;
  spotify?: UserSpotify | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftBio, setDraftBio] = useState(bio);
  const [draftSocials, setDraftSocials] = useState<{ label: string; url: string }[]>(
    initialSocials
  );
  const [draftCover, setDraftCover] = useState(initialCover ?? "");
  const [draftSpotifyUrl, setDraftSpotifyUrl] = useState(initialSpotify?.url ?? "");
  const [checkingSpot, setCheckingSpot] = useState(false);
  const [spotInfo, setSpotInfo] = useState<{
    kind: string;
    title: string | null;
    subtitle: string | null;
    image: string | null;
  } | null>(null);
  const [spotError, setSpotError] = useState("");
  const [spotQuery, setSpotQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SpotifySearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  // True once the server says search is unconfigured — the box swaps for a
  // paste-link hint instead of failing every keystroke.
  const [searchGone, setSearchGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function addSocial(preset: string) {
    const exists = draftSocials.some((s) => s.label.toLowerCase() === preset.toLowerCase());
    if (exists) {
      toast.error(`${preset} already added`);
      return;
    }
    if (draftSocials.length >= 4) {
      toast.error("Max 4 socials");
      return;
    }
    setDraftSocials([...draftSocials, { label: preset, url: "" }]);
  }

  function removeSocial(idx: number) {
    setDraftSocials(draftSocials.filter((_, i) => i !== idx));
  }

  function updateSocialUrl(idx: number, url: string) {
    setDraftSocials(draftSocials.map((s, i) => (i === idx ? { ...s, url } : s)));
  }

  async function searchSpotify() {
    const q = spotQuery.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearched(false);
    setResults([]);
    try {
      const res = await fetch(
        `/api/spotify/search?q=${encodeURIComponent(q)}`
      );
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 503) {
        setSearchGone(true);
        return;
      }
      if (!res.ok) throw new Error();
      const d = await res.json();
      setResults(Array.isArray(d.results) ? d.results : []);
      setSearched(true);
    } catch {
      setSearched(true);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function pickResult(r: SpotifySearchResult) {
    setDraftSpotifyUrl(r.url);
    setSpotInfo({
      kind: r.kind,
      title: r.title,
      subtitle: r.subtitle,
      image: r.image,
    });
    setSpotError("");
    setResults([]);
  }

  async function verifySpotify() {
    const v = draftSpotifyUrl.trim();
    if (!v) {
      setSpotError("Paste a Spotify song or artist link first.");
      return;
    }
    setCheckingSpot(true);
    setSpotError("");
    setSpotInfo(null);
    try {
      const res = await fetch("/api/spotify/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setSpotError("That doesn't look like a Spotify song/artist link.");
        return;
      }
      const d = await res.json();
      setSpotInfo({
        kind: d.spotify.kind,
        title: d.spotify.title,
        subtitle: d.spotify.subtitle,
        image: d.spotify.image,
      });
    } catch {
      setSpotError("Couldn't check that link.");
    } finally {
      setCheckingSpot(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (draftName.trim().length < 2) {
      setError("Name needs at least 2 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          bio: draftBio.trim(),
          socials: draftSocials,
          cover: draftCover.trim(),
          spotifyUrl: draftSpotifyUrl.trim(),
        }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(
          res.status === 429
            ? `Slow down — try again in ${d?.retryAfter ?? 10}s.`
            : d?.error === "invalid-cover"
              ? "That cover link doesn't work — use a direct .gif link or a Pinterest pin link."
              : d?.error === "invalid-spotify"
                ? "That Spotify link isn't a song or artist."
                : (d?.error ?? "Couldn't save.")
        );
        return;
      }
      setEditing(false);
      toast.success("Profile updated");
      router.refresh();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraftName(name);
          setDraftBio(bio);
          setDraftSocials(initialSocials);
          setDraftCover(initialCover ?? "");
          setDraftSpotifyUrl(initialSpotify?.url ?? "");
          setSpotInfo(null);
          setSpotError("");
          setSpotQuery("");
          setResults([]);
          setSearched(false);
          setEditing(true);
        }}
        className="mt-4 flex items-center gap-1.5 rounded-full border border-[#3F3F46] px-4 py-1.5 text-[13px] font-semibold text-zinc-700 dark:border-[#3F3F46] dark:text-zinc-200"
      >
        <Pencil size={14} /> Edit profile
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mx-auto mt-4 max-w-xs space-y-3 text-left">
      <div>
        <label htmlFor="edit-name" className="text-xs font-semibold text-zinc-500">
          Nickname
        </label>
        <input
          id="edit-name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          maxLength={30}
          autoComplete="off"
          className="mt-1 h-10 w-full rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 text-[14px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
        />
        <p className="text-right text-[11px] text-zinc-400">
          {graphemeLen(draftName)}/30
        </p>
      </div>
      <div>
        <label htmlFor="edit-bio" className="text-xs font-semibold text-zinc-500">
          Bio
        </label>
        <textarea
          id="edit-bio"
          value={draftBio}
          onChange={(e) => setDraftBio(e.target.value)}
          maxLength={160}
          rows={2}
          placeholder="A line about you…"
          className="mt-1 w-full resize-none rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 py-2 text-[14px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
        />
        <p className="text-right text-[11px] text-zinc-400">
          {graphemeLen(draftBio)}/160
        </p>
      </div>

      <div>
        <label htmlFor="edit-cover" className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
          <ImagePlus size={12} /> Cover — any .gif link
        </label>
        <input
          id="edit-cover"
          value={draftCover}
          onChange={(e) => setDraftCover(e.target.value)}
          placeholder="https://…/banner.gif"
          autoComplete="off"
          className="mt-1 h-10 w-full rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 text-[14px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
        />
        {draftCover.trim().startsWith("https://") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={draftCover.trim()}
            src={draftCover.trim()}
            alt="Cover preview"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="mt-2 max-h-28 w-full rounded-lg object-cover"
          />
        )}
        <p className="mt-1 text-[11px] text-zinc-500">
          Direct https .gif link or a Pinterest pin link. Clear to remove.
        </p>
      </div>

      <div>
        <label htmlFor="edit-spotify" className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
          <Music size={12} /> Favorite song / singer (Spotify)
        </label>
        {searchGone ? (
          <p className="mt-1 text-[11px] text-zinc-500">
            Song search isn&apos;t set up on the server — paste a Spotify link below instead.
          </p>
        ) : (
          <>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="edit-spotify-search"
                value={spotQuery}
                onChange={(e) => setSpotQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchSpotify();
                  }
                }}
                placeholder="Search a song or artist…"
                autoComplete="off"
                className="h-10 min-w-0 flex-1 rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 text-[14px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
              />
              <button
                type="button"
                onClick={searchSpotify}
                disabled={searching || !spotQuery.trim()}
                aria-label="Search Spotify"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-[#3F3F46] text-[#E4E4E7] hover:bg-[#18181B] disabled:opacity-50"
              >
                {searching ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Search size={15} />
                )}
              </button>
            </div>
            {results.length > 0 && (
              <div
                role="listbox"
                aria-label="Spotify results"
                className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[#27272A] bg-[#09090B] p-1.5"
              >
                {results.map((r) => (
                  <button
                    key={`${r.kind}:${r.id}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => pickResult(r)}
                    className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-[#18181B]"
                  >
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.image}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#18181B] text-zinc-400">
                        <Music size={16} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[#F4F4F5]">
                        {r.title}
                      </span>
                      <span className="block truncate text-xs text-zinc-400">
                        {r.subtitle ?? r.kind}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[#18181B] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                      {r.kind}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searched && results.length === 0 && !searching && (
              <p className="mt-1 text-[11px] text-zinc-500">
                No results — try different words, or paste a link below.
              </p>
            )}
          </>
        )}
        <p className="mt-2 text-[11px] text-zinc-500">
          …or paste a Spotify link directly:
        </p>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="edit-spotify"
            value={draftSpotifyUrl}
            onChange={(e) => {
              setDraftSpotifyUrl(e.target.value);
              setSpotInfo(null);
              setSpotError("");
            }}
            placeholder="https://open.spotify.com/track/…"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 text-[14px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
          />
          <button
            type="button"
            onClick={verifySpotify}
            disabled={checkingSpot || !draftSpotifyUrl.trim()}
            className="h-10 shrink-0 rounded-[2px] border border-[#3F3F46] px-3 text-[13px] font-semibold text-[#E4E4E7] hover:bg-[#18181B] disabled:opacity-50"
          >
            {checkingSpot ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              "Check"
            )}
          </button>
        </div>
        {spotError && (
          <p role="alert" className="mt-1 text-[12px] text-rose-500">
            {spotError}
          </p>
        )}
        {spotInfo && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#27272A] bg-[#09090B] p-2">
            {spotInfo.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={spotInfo.image}
                alt=""
                className="h-10 w-10 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#18181B] text-zinc-400">
                <Music size={16} />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#F4F4F5]">
                {spotInfo.title ?? (spotInfo.kind === "track" ? "Song" : "Artist")}
              </p>
              <p className="truncate text-xs text-zinc-400">
                {spotInfo.subtitle ?? spotInfo.kind}
              </p>
            </div>
          </div>
        )}
        {!spotInfo && initialSpotify && !draftSpotifyUrl.trim() && (
          <p className="mt-1 text-[11px] text-zinc-500">
            Clearing removes “{initialSpotify.title ?? initialSpotify.kind}” from your profile.
          </p>
        )}
        <p className="mt-1 text-[11px] text-zinc-500">
          Song or artist link/URI only — albums &amp; playlists won&apos;t take.
        </p>
      </div>

      <div>
        <label className="text-xs font-semibold text-zinc-500">Social links</label>
        <div className="mt-1 space-y-2">
          {draftSocials.map((s, idx) => {
            const Icon = iconFor(s.label);
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="flex h-9 w-24 shrink-0 items-center justify-center rounded-xl border border-[#27272A] bg-[#09090B] text-zinc-300 px-2 text-xs font-semibold">
                  <Icon size={13} className="mr-1 opacity-70" />
                  {s.label}
                </span>
                <input
                  value={s.url}
                  onChange={(e) => updateSocialUrl(idx, e.target.value)}
                  placeholder="https://…"
                  className="h-9 min-w-0 flex-1 rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 text-[13px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
                />
                <button
                  type="button"
                  onClick={() => removeSocial(idx)}
                  aria-label={`Remove ${s.label}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-[#18181B] hover:text-[#F4F4F5]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => {
            const added = draftSocials.some((s) => s.label.toLowerCase() === preset.toLowerCase());
            const Icon = iconFor(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => addSocial(preset)}
                disabled={added}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                  added
                    ? "cursor-not-allowed border-[#3F3F46] bg-zinc-800 text-zinc-500"
                    : "border-[#27272A] bg-[#09090B] text-zinc-300 hover:bg-[#18181B]"
                }`}
              >
                <Icon size={12} />
                {preset} {added ? "✓" : "+"}
              </button>
            );
          })}
        </div>
        <p className="mt-1 flex justify-between text-[11px] text-zinc-500">
          <span>One per platform, max 4. Paste full URL.</span>
          <span>{draftSocials.length}/4</span>
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-rose-600">
          {error}
        </p>
      )}
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-[2px] border border-[#3F3F46] px-4 py-1.5 text-[13px] font-semibold text-[#E4E4E7] hover:bg-[#18181B]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-[2px] bg-[#FAFAFA] px-4 py-1.5 text-[13px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
