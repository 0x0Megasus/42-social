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

// Real-wood palette (chess.com walnut/maple): warm, photographic, tactile.
// Frame uses layered gradients to read as varnished timber, not flat color.
const LIGHT = "bg-[#f0d9b5]";
const DARK = "bg-[#b58863]";
const SELECT_RING = "ring-[#ffd54a]";
const HINT_DOT = "bg-[#3d5a28]/50";
const CAPTURE_RING = "ring-[#2f4a1f]/80";
const LASTMOVE = "bg-[#f5e65c]/70";

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ClockChip({
  side,
  liveClock,
  active,
}: {
  side: "w" | "b";
  liveClock: { w: number; b: number } | null;
  active: boolean;
}) {
  // Always rendered (placeholder when the clock isn't seeded yet) so the
  // player bars keep a stable height — mounting/unmounting the chip
  // resizes the bars and makes the whole board jump.
  if (!liveClock) {
    return (
      <span
        aria-hidden
        className="rounded-lg bg-black/40 px-2.5 py-1 font-mono text-[15px] font-bold tabular-nums text-stone-600 shadow-sm ring-1 ring-inset ring-white/10"
      >
        {side === "w" ? "♔ " : "♚ "}
        –:––
      </span>
    );
  }
  const ms = side === "w" ? liveClock.w : liveClock.b;
  const low = ms < 30_000;
  return (
    <span
      className={cn(
        "rounded-lg px-2.5 py-1 font-mono text-[15px] font-bold tabular-nums shadow-sm ring-1 ring-inset transition-colors",
        active
          ? low
            ? "animate-pulse bg-[#b91c1c] text-white ring-red-400/50"
            : "bg-[#1c1917] text-[#ffd54a] ring-amber-200/20"
          : "bg-black/40 text-stone-300 ring-white/10"
      )}
    >
      {side === "w" ? "♔ " : "♚ "}
      {fmtClock(ms)}
    </span>
  );
}

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
  clock,
  onFlag,
}: {
  board: ChessBoard;
  myColor: "w" | "b" | null;
  interactive: boolean;
  onMove: (from: string, to: string, promotion?: string) => void;
  clock?: { w: number; b: number; msAt: number } | null;
  onFlag?: () => void;
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

  // Live clock: derive from the last server tick and re-render on an interval.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!clock || board.history.length === 0) return;
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, [clock, board.history.length]);

  const liveClock = useMemo(() => {
    if (!clock) return null;
    const whiteToMove = game.turn() === "w";
    const elapsed = Math.max(0, nowTick - clock.msAt);
    const w = Math.max(0, clock.w - (whiteToMove ? elapsed : 0));
    const b = Math.max(0, clock.b - (whiteToMove ? 0 : elapsed));
    return { w, b };
  }, [clock, game, nowTick]);

  // Flag fall: call onFlag once when my (or anyone's) clock visually hits 0.
  const flaggedRef = useRef(false);
  useEffect(() => {
    if (!liveClock || !onFlag || flaggedRef.current) return;
    if (liveClock.w <= 0 || liveClock.b <= 0) {
      flaggedRef.current = true;
      onFlag();
    }
  }, [liveClock, onFlag]);

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
    const piece = (() => {
      try {
        return game.get(sq as Square);
      } catch {
        return null;
      }
    })();
    if (selected && legal.has(sq)) {
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

  const turn = (() => {
    try {
      return game.turn();
    } catch {
      return null;
    }
  })();

  const oppSide = myColor === "b" ? "w" : "b";
  const mySide = myColor === "b" ? "b" : "w";

  return (
    <div className="space-y-2">
      {/* opponent: clock + captured tray + material */}
      <div className="flex items-center gap-2 rounded-xl bg-black/50 px-2.5 py-1.5 ring-1 ring-white/10 backdrop-blur">
        <ClockChip
          side={oppSide}
          liveClock={liveClock}
          active={turn === oppSide && board.history.length > 0}
        />
        <div className="flex h-6 min-w-0 flex-1 items-center gap-1 text-lg leading-none">
          {capturedBy(board.fen, myColor === "b" ? "b" : "w").map((t, i) => (
            <span
              key={i}
              className="-ml-2 text-stone-300 first:ml-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >
              {GLYPHS[myColor === "b" ? "b" : "w"][t]}
            </span>
          ))}
          {myColor && diff !== 0 && (myColor === "w" ? diff > 0 : diff < 0) && (
            <span className="ml-1 text-xs font-bold text-amber-300/90">
              +{Math.abs(diff)}
            </span>
          )}
        </div>
      </div>

      {/* timber frame + board */}
      <div className="rounded-2xl bg-gradient-to-br from-[#6b4f35] via-[#4a3525] to-[#2b1f14] p-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-2px_6px_rgba(0,0,0,0.5)] ring-1 ring-black/60 sm:p-2.5">
      <div className="relative overflow-hidden rounded-lg shadow-[inset_0_2px_12px_rgba(0,0,0,0.45)] ring-1 ring-black/70">
        <div
          role="grid"
          aria-label="Chess board"
          className="grid grid-cols-8 select-none"
        >
          {ranks.map((r) =>
            files.map((f) => {
              const sq = `${f}${r}`;
              const isDark = (FILES.indexOf(f) + r) % 2 === 0;
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
              const canSelect =
                interactive && !!myColor && piece?.color === myColor;
              return (
                <button
                  key={sq}
                  role="gridcell"
                  aria-label={`${sq}${piece ? `, ${piece.color} ${piece.type}` : ""}`}
                  onClick={() => clickSquare(sq)}
                  className={cn(
                    "relative flex aspect-square touch-manipulation items-center justify-center transition-[filter,box-shadow] duration-100",
                    isDark ? DARK : LIGHT,
                    canSelect && !isSel && "cursor-pointer hover:brightness-[1.07]",
                    target && "cursor-pointer",
                    isSel && `z-10 ring-4 ring-inset ${SELECT_RING}`
                  )}
                >
                  {/* wood sheen per square */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/14 via-transparent to-black/12"
                  />
                  {isLast && (
                    <span
                      aria-hidden
                      className={cn("pointer-events-none absolute inset-0", LASTMOVE)}
                    />
                  )}
                  {f === files[0] && (
                    <span
                      className={cn(
                        "absolute left-1 top-0.5 z-10 text-[10px] font-extrabold tracking-tight",
                        isDark ? "text-[#f0d9b5]" : "text-[#b58863]"
                      )}
                    >
                      {r}
                    </span>
                  )}
                  {r === ranks[ranks.length - 1] && (
                    <span
                      className={cn(
                        "absolute bottom-0.5 right-1 z-10 text-[10px] font-extrabold tracking-tight",
                        isDark ? "text-[#f0d9b5]" : "text-[#b58863]"
                      )}
                    >
                      {f}
                    </span>
                  )}
                  {isCheck && (
                    <span className="absolute inset-0 animate-pulse bg-[radial-gradient(circle,rgba(220,38,38,0.9)_22%,rgba(220,38,38,0.35)_55%,transparent_75%)]" />
                  )}
                  {piece && (
                    <span
                      className={cn(
                        "relative z-[5] leading-none transition-transform duration-100",
                        "text-[30px] sm:text-[38px]",
                        isSel && "scale-110",
                        canSelect && "hover:scale-[1.06]",
                        piece.color === "w"
                          ? "text-[#fafafa] [-webkit-text-stroke:1.5px_rgba(30,20,10,0.85)] [text-shadow:0_1px_0_rgba(0,0,0,0.9),0_3px_4px_rgba(0,0,0,0.55),0_6px_10px_rgba(0,0,0,0.4)] drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]"
                          : "text-[#141210] [-webkit-text-stroke:1px_rgba(240,217,181,0.35)] [text-shadow:0_1px_1px_rgba(255,235,200,0.45),0_3px_5px_rgba(0,0,0,0.8),0_6px_10px_rgba(0,0,0,0.5)] drop-shadow-[0_4px_4px_rgba(0,0,0,0.6)]"
                      )}
                    >
                      {GLYPHS[piece.color][piece.type]}
                    </span>
                  )}
                  {target && !piece && (
                    <span
                      className={cn(
                        "absolute z-[6] h-[26%] w-[26%] rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-black/20",
                        HINT_DOT
                      )}
                    />
                  )}
                  {target && piece && (
                    <span
                      className={cn(
                        "absolute inset-[3px] z-[6] rounded-sm ring-[3px] ring-inset",
                        CAPTURE_RING
                      )}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
        {/* vignette: felt depth over the whole board */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.35)]"
        />

        {promo && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
            <div
              role="dialog"
              aria-label="Choose promotion piece"
              className="flex gap-2 rounded-2xl border border-amber-100/20 bg-[#1c1917] p-3 shadow-2xl"
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
                  className="flex h-16 w-16 items-center justify-center rounded-xl text-5xl transition-all hover:scale-105 hover:bg-white/10"
                >
                  <span
                    className={
                      (myColor ?? "w") === "w"
                        ? "text-[#fafafa] [-webkit-text-stroke:1.5px_rgba(30,20,10,0.85)] [text-shadow:0_2px_4px_rgba(0,0,0,0.6)]"
                        : "text-[#141210] [-webkit-text-stroke:1px_rgba(240,217,181,0.35)] [text-shadow:0_2px_4px_rgba(0,0,0,0.7)]"
                    }
                  >
                    {GLYPHS[myColor ?? "w"][p]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* me: clock + captured tray + material + flip */}
      <div className="flex items-center gap-2 rounded-xl bg-black/50 px-2.5 py-1.5 ring-1 ring-white/10 backdrop-blur">
        <ClockChip
          side={mySide}
          liveClock={liveClock}
          active={turn === mySide && board.history.length > 0}
        />
        <div className="flex h-6 min-w-0 flex-1 items-center gap-1 text-lg leading-none">
          {capturedBy(board.fen, myColor === "b" ? "w" : "b").map((t, i) => (
            <span
              key={i}
              className="-ml-2 text-stone-300 first:ml-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >
              {GLYPHS[myColor === "b" ? "w" : "b"][t]}
            </span>
          ))}
          {myColor && diff !== 0 && (myColor === "b" ? diff > 0 : diff < 0) && (
            <span className="ml-1 text-xs font-bold text-amber-300/90">
              +{Math.abs(diff)}
            </span>
          )}
        </div>
        <button
          onClick={() => setFlipped((f) => !f)}
          aria-label="Flip board"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-white/10 hover:text-stone-200"
        >
          <ArrowUpDown size={14} />
        </button>
      </div>
    </div>
  );
}
