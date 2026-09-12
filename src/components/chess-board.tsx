"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ChessBoard } from "@/lib/games/chess";
import { playCapture, playCheck } from "@/lib/sound";

const GLYPHS: Record<string, Record<string, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function capturedBy(fen: string, by: "w" | "b"): string[] {
  // pieces OF the opponent captured BY `by`
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const alive: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  try {
    const g = new Chess(fen);
    for (const row of g.board())
      for (const sq of row) {
        if (sq && sq.color !== by && sq.type !== "k") alive[sq.type] += 1;
      }
  } catch {
    return [];
  }
  const out: string[] = [];
  const order = ["q", "r", "b", "n", "p"];
  for (const t of order) {
    for (let i = 0; i < start[t] - alive[t]; i++) out.push(t);
  }
  return out;
}

export function ChessBoardView({
  board,
  myColor,
  interactive,
  onMove,
}: {
  board: ChessBoard;
  myColor: "w" | "b" | null;
  interactive: boolean;
  onMove: (from: string, to: string, promotion?: string) => void;
}) {
  const game = useMemo(() => {
    try {
      return new Chess(board.fen);
    } catch {
      return new Chess();
    }
  }, [board.fen]);

  const [flipped, setFlipped] = useState(myColor === "b");
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const prevFen = useRef(board.fen);
  const histRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(null);
    setPromo(null);
  }, [board.fen]);

  // turn flipped away mid-select (poll update) — drop stale dots
  useEffect(() => {
    if (!interactive) {
      setSelected(null);
      setPromo(null);
    }
  }, [interactive]);

  // capture + check jingles on incoming positions
  useEffect(() => {
    if (prevFen.current === board.fen) return;
    try {
      const before = new Chess(prevFen.current);
      const after = new Chess(board.fen);
      const countPieces = (g: Chess) =>
        g.board().flat().filter(Boolean).length;
      if (countPieces(after) < countPieces(before)) playCapture();
      if (after.isCheck()) playCheck();
    } catch {
      /* ignore */
    }
    prevFen.current = board.fen;
  }, [board.fen]);

  useEffect(() => {
    histRef.current?.scrollTo({ top: histRef.current.scrollHeight });
  }, [board.history.length]);

  const legal = useMemo(() => {
    if (!selected) return new Map<string, { capture: boolean; promo: boolean }>();
    const m = new Map<string, { capture: boolean; promo: boolean }>();
    try {
      for (const mv of game.moves({ square: selected as Square, verbose: true })) {
        m.set(mv.to, {
          capture: mv.flags.includes("c") || mv.flags.includes("e"),
          promo: mv.flags.includes("p"),
        });
      }
    } catch {
      /* ignore */
    }
    return m;
  }, [game, selected]);

  const lastMove = useMemo(() => {
    try {
      const h = game.history({ verbose: true });
      const last = h[h.length - 1];
      return last ? { from: last.from, to: last.to } : null;
    } catch {
      return null;
    }
  }, [game]);

  const kingInCheck = useMemo(() => {
    try {
      if (!game.isCheck()) return null;
      const turn = game.turn();
      for (const row of game.board())
        for (const sq of row) {
          if (sq && sq.type === "k" && sq.color === turn) return sq.square;
        }
      return null;
    } catch {
      return null;
    }
  }, [game]);

  function clickSquare(sq: string) {
    if (!myColor) return;
    // piece of mine -> select
    const piece = (() => {
      try {
        return game.get(sq as Square);
      } catch {
        return null;
      }
    })();
    if (selected && legal.has(sq)) {
      // a dot was tapped — a move attempt must never die silently
      if (!interactive) {
        toast.info("Wait for your turn.");
        return;
      }
      const info = legal.get(sq)!;
      if (info.promo) {
        setPromo({ from: selected, to: sq });
        return;
      }
      onMove(selected, sq);
      setSelected(null);
      return;
    }
    if (!interactive) return;
    if (piece && piece.color === myColor) {
      setSelected(selected === sq ? null : sq);
    } else {
      setSelected(null);
    }
  }

  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? [...FILES].reverse() : FILES;
  const diff = useMemo(() => {
    const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const score = (color: "w" | "b") => {
      let s = 0;
      try {
        const g = new Chess(board.fen);
        for (const row of g.board())
          for (const sq of row) {
            if (sq && sq.color === color && sq.type !== "k") s += values[sq.type];
          }
      } catch {
        /* ignore */
      }
      return s;
    };
    return score("w") - score("b");
  }, [board.fen]);

  const pairs: [string, string | null][] = [];
  for (let i = 0; i < board.history.length; i += 2) {
    pairs.push([board.history[i], board.history[i + 1] ?? null]);
  }

  return (
    <div className="space-y-2">
      {/* opponent tray */}
      <div className="flex h-6 items-center gap-1 px-1 text-lg leading-none">
        {capturedBy(board.fen, myColor === "b" ? "b" : "w").map((t, i) => (
          <span key={i} className="-ml-2 text-zinc-400 first:ml-0 dark:text-zinc-500">
            {GLYPHS[myColor === "b" ? "b" : "w"][t]}
          </span>
        ))}
        {myColor && diff !== 0 && (myColor === "w" ? diff > 0 : diff < 0) && (
          <span className="ml-1 text-xs font-bold text-zinc-500">+{Math.abs(diff)}</span>
        )}
      </div>

      <div className="relative">
        <div
          role="grid"
          aria-label="Chess board"
          className="grid grid-cols-8 overflow-hidden rounded-2xl border border-zinc-300 shadow-lg dark:border-zinc-700"
        >
          {ranks.map((r) =>
            files.map((f) => {
              const sq = `${f}${r}`;
              const dark = (FILES.indexOf(f) + r) % 2 === 0;
              let piece: { type: string; color: string } | null = null;
              try {
                const got = game.get(sq as Square);
                if (got) piece = { type: got.type, color: got.color };
              } catch {
                piece = null;
              }
              const isSel = selected === sq;
              const target = legal.get(sq);
              const isLast =
                lastMove && (lastMove.from === sq || lastMove.to === sq);
              const isCheck = kingInCheck === sq;
              return (
                <button
                  key={sq}
                  role="gridcell"
                  aria-label={`${sq}${piece ? `, ${piece.color} ${piece.type}` : ""}`}
                  onClick={() => clickSquare(sq)}
                  className={cn(
                    "relative flex aspect-square items-center justify-center transition-colors",
                    dark ? "bg-zinc-400 dark:bg-zinc-600" : "bg-zinc-100 dark:bg-zinc-800",
                    isLast && "bg-cyan-200/70 dark:bg-cyan-700/50",
                    isSel && "ring-4 ring-inset ring-cyan-400"
                  )}
                >
                  {f === files[0] && (
                    <span className="absolute left-0.5 top-0.5 text-[9px] font-bold text-zinc-500/80 dark:text-zinc-400/80">
                      {r}
                    </span>
                  )}
                  {r === ranks[ranks.length - 1] && (
                    <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-zinc-500/80 dark:text-zinc-400/80">
                      {f}
                    </span>
                  )}
                  {isCheck && (
                    <span className="absolute inset-0 bg-[radial-gradient(circle,rgba(244,63,94,0.75)_20%,transparent_70%)]" />
                  )}
                  {piece && (
                    <span
                      className={cn(
                        "text-[26px] leading-none sm:text-3xl",
                        piece.color === "w"
                          ? "text-zinc-50 [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_0_1px_rgba(0,0,0,0.9)]"
                          : "text-zinc-950 dark:text-black [text-shadow:0_1px_1px_rgba(255,255,255,0.25)]"
                      )}
                    >
                      {GLYPHS[piece.color][piece.type]}
                    </span>
                  )}
                  {target && !piece && (
                    <span className="h-1/4 w-1/4 rounded-full bg-zinc-500/40" />
                  )}
                  {target && piece && (
                    <span className="absolute inset-0 rounded-none ring-4 ring-inset ring-zinc-500/50" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {promo && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/60">
            <div
              role="dialog"
              aria-label="Choose promotion piece"
              className="flex gap-2 rounded-2xl bg-white p-3 dark:bg-zinc-900"
            >
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    onMove(promo.from, promo.to, p);
                    setPromo(null);
                    setSelected(null);
                  }}
                  aria-label={`Promote to ${p}`}
                  className="flex h-14 w-14 items-center justify-center rounded-xl text-4xl transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {GLYPHS[myColor ?? "w"][p]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* my tray + controls */}
      <div className="flex h-6 items-center gap-1 px-1 text-lg leading-none">
        {capturedBy(board.fen, myColor === "b" ? "w" : "b").map((t, i) => (
          <span key={i} className="-ml-2 text-zinc-400 first:ml-0 dark:text-zinc-500">
            {GLYPHS[myColor === "b" ? "w" : "b"][t]}
          </span>
        ))}
        {myColor && diff !== 0 && (myColor === "b" ? diff > 0 : diff < 0) && (
          <span className="ml-1 text-xs font-bold text-zinc-500">+{Math.abs(diff)}</span>
        )}
        <button
          onClick={() => setFlipped((f) => !f)}
          aria-label="Flip board"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <ArrowUpDown size={14} />
        </button>
      </div>

      {/* move history */}
      {pairs.length > 0 && (
        <div
          ref={histRef}
          aria-label="Move history"
          className="max-h-28 space-y-0.5 overflow-y-auto rounded-xl bg-zinc-50 p-2 dark:bg-zinc-900/60"
        >
          {pairs.map(([w, b], i) => (
            <div key={i} className="grid grid-cols-[2rem_1fr_1fr] text-[13px]">
              <span className="text-zinc-400">{i + 1}.</span>
              <span className="font-mono font-semibold">{w}</span>
              <span className="font-mono text-zinc-500">{b ?? ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
