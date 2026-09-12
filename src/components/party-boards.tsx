"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { rpsEmoji, type RPSBoard, type RPSPick } from "@/lib/games/rps";
import { heatColor, type NumberBoard } from "@/lib/games/number";
import {
  cardLabel,
  handValue,
  type TwentyBoard,
} from "@/lib/games/twentyone";

// ---------- Rock-Paper-Scissors ----------
const RPS_CHOICES: RPSPick[] = ["rock", "paper", "scissors"];

export function RPSBoardView({
  board,
  interactive,
  onPick,
}: {
  board: RPSBoard;
  interactive: boolean;
  onPick: (pick: RPSPick) => void;
}) {
  const locked = !!board.picks && Object.keys(board.picks).length > 0 && interactive;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {RPS_CHOICES.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            disabled={!interactive || locked}
            aria-label={`Play ${p}`}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl border py-4 transition-all",
              locked
                ? "border-zinc-200 opacity-60 dark:border-zinc-800"
                : "border-zinc-200 bg-white hover:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-cyan-600"
            )}
          >
            <span className="text-4xl">{rpsEmoji(p)}</span>
            <span className="text-xs font-semibold capitalize text-zinc-500">{p}</span>
          </button>
        ))}
      </div>
      {locked && (
        <p className="text-center text-[13px] text-zinc-500">
          Locked in — waiting for opponent…
        </p>
      )}
      {board.rounds.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {board.rounds.map((r, i) => (
            <span
              key={i}
              title={`Round ${i + 1}`}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[13px]",
                r.winner
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"
              )}
            >
              {r.winner ? (i + 1) : "="}
            </span>
          ))}
        </div>
      )}
      <p className="text-center text-[13px] font-semibold">
        First to {board.target ?? 3} wins
      </p>
    </div>
  );
}

// ---------- Number Duel ----------
export function NumberBoardView({
  board,
  interactive,
  onGuess,
}: {
  board: NumberBoard;
  interactive: boolean;
  onGuess: (n: number) => void;
}) {
  const [val, setVal] = useState("");
  const guesses = [...(board.guesses ?? [])].reverse();
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(val);
          if (!Number.isInteger(n) || n < 1 || n > 100) return;
          onGuess(n);
          setVal("");
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="num-guess" className="sr-only">
          Guess 1 to 100
        </label>
        <input
          id="num-guess"
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          placeholder="1–100"
          inputMode="numeric"
          disabled={!interactive}
          className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-transparent px-3 text-center text-lg font-bold outline-none focus:border-cyan-500 disabled:opacity-40 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={!interactive || !val}
          className="h-11 shrink-0 rounded-xl bg-zinc-900 px-5 text-[14px] font-semibold text-white disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Guess
        </button>
      </form>
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {guesses.length === 0 && (
          <p className="py-2 text-center text-[13px] text-zinc-400">
            No guesses yet — range is 1 to 100.
          </p>
        )}
        {guesses.map((g, i) => (
          <div
            key={`${g.by}-${g.n}-${i}`}
            className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-1.5 text-[14px] dark:bg-zinc-900"
          >
            <span className="font-mono font-bold">{g.n}</span>
            <span className={cn("text-[13px] font-semibold capitalize", heatColor(g.hint))}>
              {g.hint === "exact" ? "exact! 🎯" : g.hint}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 21 Duel ----------
export function TwentyOneBoardView({
  board,
  meId,
  opponentId,
  interactive,
  onHit,
  onStand,
}: {
  board: TwentyBoard;
  meId: string;
  opponentId: string | null;
  interactive: boolean;
  onHit: () => void;
  onStand: () => void;
}) {
  const mine = board.hands?.[meId] ?? [];
  const theirs = opponentId ? (board.hands?.[opponentId] ?? []) : [];
  const myTotal = handValue(mine);
  const myStood = !!board.stood?.[meId];
  return (
    <div className="space-y-3">
      {([
        { label: "Opponent", hand: theirs, total: null as number | null },
        { label: "You", hand: mine, total: myTotal },
      ]).map(({ label, hand, total }) => (
        <div
          key={label}
          className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {label}
            {total !== null && total !== undefined ? ` · ${total}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hand.length === 0 && (
              <span className="text-[13px] text-zinc-400">—</span>
            )}
            {hand.map((c, i) => (
              <span
                key={i}
                className="flex h-11 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white font-mono text-[15px] font-bold shadow-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                {cardLabel(c)}
              </span>
            ))}
          </div>
        </div>
      ))}
      {myStood ? (
        <p className="text-center text-[13px] text-zinc-500">
          You stood — waiting for opponent…
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onHit}
            disabled={!interactive}
            className="rounded-xl bg-zinc-900 py-2.5 text-[14px] font-semibold text-white disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Hit
          </button>
          <button
            onClick={onStand}
            disabled={!interactive}
            className="rounded-xl border border-zinc-300 py-2.5 text-[14px] font-semibold disabled:opacity-30 dark:border-zinc-700"
          >
            Stand
          </button>
        </div>
      )}
    </div>
  );
}
