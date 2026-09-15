// Optimistic move preview — the "zero perceived latency" layer.
//
// Pure engines already run client-side (see tictactoe/chess), so the mover's
// own board can show the result of a move IMMEDIATELY, before the server
// confirms. Full-information games only: RPS picks are secret until both
// sides commit (nothing to show), and Number/21 draw hidden state.
import { tttWinner, tttFull, tttLegal, type TTTBoard, type TTTMark } from "./tictactoe";
import {
  c4Drop,
  c4Winner,
  c4Full,
  C4_COLS,
  C4_ROWS,
  type C4Board,
  type C4Mark,
} from "./connectfour";
import { Chess } from "chess.js";
import type { ChessBoard } from "./chess";

export type OptimisticResult<T> =
  | { ok: true; board: T }
  | { ok: false; reason: "illegal" };

/** Apply the mover's TTT cell locally; mirrors games-store's playMove branch. */
export function previewTttMove(
  board: TTTBoard,
  cell: number,
  mark: TTTMark
): OptimisticResult<TTTBoard> {
  if (!tttLegal(board, cell)) return { ok: false, reason: "illegal" };
  const next = board.slice();
  next[cell] = mark;
  return { ok: true, board: next };
}

/** Drop the mover's C4 disc locally; mirrors games-store's playMove branch. */
export function previewC4Move(
  board: C4Board,
  col: number,
  mark: C4Mark
): OptimisticResult<C4Board> {
  const row = c4Drop(board, col);
  if (row < 0) return { ok: false, reason: "illegal" };
  const next = board.map((r) => r.slice()) as C4Board;
  next[row][col] = mark;
  return { ok: true, board: next };
}

/** Apply the mover's chess SAN move locally (promotion defaults to queen, same as server). */
export function previewChessMove(
  board: ChessBoard,
  from: string,
  to: string,
  promotion?: string
): OptimisticResult<ChessBoard> {
  let game: Chess;
  try {
    game = new Chess(board.fen);
  } catch {
    return { ok: false, reason: "illegal" };
  }
  let san = "";
  try {
    const mv = game.move({
      from,
      to,
      promotion: (promotion as "q" | "r" | "b" | "n") ?? "q",
    });
    san = mv.san;
  } catch {
    return { ok: false, reason: "illegal" };
  }
  return {
    ok: true,
    // Carry the clock through: dropping it would unmount the clock chips
    // and resize the player bars on every move (visible board jump).
    board: { fen: game.fen(), history: [...board.history, san], clock: board.clock ?? null },
  };
}

/** Locally stand in 21 — no hidden info involved, just marks the player as stood. */
export function previewTwentyOneStand(
  hands: Record<string, number[]>,
  stood: Record<string, boolean>,
  meId: string
): { stood: Record<string, boolean> } {
  return { stood: { ...stood, [meId]: true } };
}

// Sanity: exports referenced by game-room + tests
export const _internal = { tttWinner, tttFull, c4Winner, c4Full, C4_ROWS, C4_COLS };
