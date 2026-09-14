"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, LogIn, Swords, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ApiTimeoutError } from "@/lib/api";
import { Avatar } from "@/components/post-card";
import { timeAgo } from "@/lib/format";
import { GAME_LABEL, type GameKind, type GameView } from "@/lib/games/types";

const GAMES: { kind: GameKind; blurb: string; emoji: string }[] = [
  { kind: "chess", blurb: "The royal game. Full rules.", emoji: "♟️" },
  { kind: "connectfour", blurb: "Drop discs, connect four.", emoji: "🔴" },
  { kind: "tictactoe", blurb: "Three in a row. Fast and ruthless.", emoji: "⭕" },
  { kind: "rps", blurb: "Best of 5 — bluff, read, strike.", emoji: "✊" },
  // Retired: "number" + "twentyone" stay playable via existing rooms/engines
  // but are no longer offered — see POST /api/games.
];

export function GamesLobby({
  active,
  meId,
}: {
  active: GameView[];
  meId: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState<GameKind | null>(null);
  const [joining, setJoining] = useState(false);

  async function create(kind: GameKind) {
    if (creating) return;
    setCreating(kind);
    try {
      const res = await api("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      router.push(`/games/${d.room.id}`);
    } catch (e) {
      toast.error(e instanceof ApiTimeoutError ? e.message : "Couldn't create room.");
      setCreating(null);
    }
  }

  // Accepts a bare code (BK9YW8) or a full invite link
  // (http://localhost:3000/games/BK9YW8) — extracts the code either way.
  function extractCode(raw: string): string {
    const s = raw.trim().toUpperCase();
    const clean = (x: string) => x.replace(/[^A-Z0-9]/g, "");
    if (s.includes("/")) {
      const path = s.split(/[?#]/)[0];
      const segs = path.split("/").filter(Boolean);
      const last = clean(segs.pop() ?? "");
      return /^[A-Z0-9]{6}$/.test(last) ? last : "";
    }
    const alnum = clean(s);
    return /^[A-Z0-9]{6}$/.test(alnum) ? alnum : "";
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = extractCode(code);
    if (!c) {
      toast.error("That doesn't look like a room code or invite link.");
      return;
    }
    setJoining(true);
    router.push(`/games/${c}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 px-1 text-lg font-bold tracking-tight">
        <Swords size={20} /> Arcade
      </h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GAMES.map((g) => (
          <div
            key={g.kind}
            className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-3xl">{g.emoji}</p>
            <h2 className="mt-2 text-[16px] font-bold">{GAME_LABEL[g.kind]}</h2>
            <p className="mt-0.5 text-[13px] text-zinc-500">{g.blurb}</p>
            <button
              onClick={() => create(g.kind)}
              disabled={creating !== null}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#FAFAFA] py-2.5 text-[14px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] disabled:opacity-70"
            >
              {creating === g.kind ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  Creating room…
                </>
              ) : (
                <>
                  <Plus size={16} /> New room
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={join}
        className="flex items-stretch gap-2 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label htmlFor="join-code" className="sr-only">
          Room code
        </label>
        <input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Code or invite link — e.g. K7Q2XD"
          maxLength={200}
          autoComplete="off"
          className="h-10 min-w-0 flex-1 appearance-none rounded border-[1px] border-[#27272A] bg-[#09090B] px-3 font-mono text-[14px] uppercase tracking-widest text-[#F4F4F5] placeholder:tracking-normal placeholder:text-[12px] placeholder:text-[#71717A] sm:placeholder:text-[13px] outline-none focus:border-[#52525B]"
        />
        <button
          type="submit"
          disabled={joining}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded border-[1px] border-transparent bg-[#FAFAFA] px-4 text-[14px] font-semibold leading-none text-[#18181B] hover:bg-[#E4E4E7] disabled:opacity-70"
        >
          {joining ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <LogIn size={15} />
          )}
          Join
        </button>
      </form>

      {active.length > 0 && (
        <section aria-label="My games" className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-zinc-400">
            My games
          </h2>
          {active.map((r) => {
            const opp =
              r.opponentId === r.players.host?.id
                ? r.players.host
                : r.players.guest;
            return (
              <button
                key={r.id}
                onClick={() => router.push(`/games/${r.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <Avatar
                  name={opp?.name ?? "?"}
                  src={opp?.avatar ?? null}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">
                    {GAME_LABEL[r.kind]} · {r.id}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    vs {opp?.name ?? "waiting…"} ·{" "}
                    {r.status === "over"
                      ? r.winnerId === meId
                        ? "you won"
                        : r.winnerId
                          ? "you lost"
                          : "draw"
                      : r.status === "waiting"
                        ? "waiting for opponent"
                        : r.turn === meId
                          ? "your turn"
                          : "their turn"}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-zinc-400">
                  {timeAgo(r.updatedAt)}
                </span>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
