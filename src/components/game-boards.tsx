"use client";

import { cn } from "@/lib/utils";
import { freshTTT, type TTTBoard } from "@/lib/games/tictactoe";
import { C4_COLS, freshC4, type C4Board } from "@/lib/games/connectfour";

export function TTTBoardView({
  board = freshTTT(),
  winLine,
  interactive,
  onCell,
}: {
  board?: TTTBoard;
  winLine: number[] | null;
  interactive: boolean;
  onCell: (cell: number) => void;
}) {
  return (
    <div
      role="grid"
      aria-label="Tic-tac-toe board"
      className="grid grid-cols-3 gap-2"
    >
      {board.map((mark, i) => {
        const hot = winLine?.includes(i) ?? false;
        return (
          <button
            key={i}
            role="gridcell"
            aria-label={`Cell ${i + 1}${mark ? `, ${mark}` : ""}`}
            disabled={!interactive || !!mark}
            onClick={() => onCell(i)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-2xl border text-4xl font-black transition-all",
              hot
                ? "border-emerald-400 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
              interactive &&
                !mark &&
                "hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/20"
            )}
          >
            {mark === "X" ? (
              <span className="text-zinc-900 dark:text-zinc-50">✕</span>
            ) : mark === "O" ? (
              <span className="text-cyan-500">◯</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function C4BoardView({
  board = freshC4(),
  winLine,
  interactive,
  onCol,
}: {
  board?: C4Board;
  winLine: [number, number][] | null;
  interactive: boolean;
  onCol: (col: number) => void;
}) {
  const hot = new Set((winLine ?? []).map(([r, c]) => `${r}:${c}`));
  return (
    <div aria-label="Connect four board" className="space-y-2">
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: C4_COLS }, (_, c) => (
          <button
            key={c}
            onClick={() => onCol(c)}
            disabled={!interactive}
            aria-label={`Drop in column ${c + 1}`}
            className={cn(
              "flex h-8 items-center justify-center rounded-lg text-lg transition-colors",
              interactive
                ? "text-zinc-400 hover:bg-cyan-50 hover:text-cyan-500 dark:hover:bg-cyan-950/30"
                : "text-transparent"
            )}
          >
            ▼
          </button>
        ))}
      </div>
      <div
        role="grid"
        className="grid grid-cols-7 gap-1.5 rounded-2xl border border-zinc-200 bg-zinc-100 p-2 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {board.map((row, r) =>
          row.map((mark, c) => {
            const isHot = hot.has(`${r}:${c}`);
            return (
              <div
                key={`${r}:${c}`}
                role="gridcell"
                aria-label={`Row ${r + 1} column ${c + 1}${mark ? `, ${mark}` : ""}`}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-full transition-all",
                  isHot
                    ? "bg-emerald-400"
                    : mark === "R"
                      ? "bg-rose-500 shadow-[inset_-2px_-3px_0_rgba(0,0,0,0.25)]"
                      : mark === "Y"
                        ? "bg-amber-400 shadow-[inset_-2px_-3px_0_rgba(0,0,0,0.2)]"
                        : "bg-white dark:bg-zinc-950"
                )}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
