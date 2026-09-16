export type ChessBoard = {
  fen: string;
  history: string[];
  clock?: {
    w: number; // ms remaining, white
    b: number; // ms remaining, black
    msAt: number; // server epoch ms the values were computed at
  } | null;
};

export const CHESS_STARTPOS =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function freshChess(): ChessBoard {
  return { fen: CHESS_STARTPOS, history: [] };
}

export const CHESS_CLOCK_START_MS = 10 * 60 * 1000; // 10 minutes per side

export function tickChessClock(
  clock: ChessBoard["clock"],
  now: number,
  turnIsWhite: boolean
): NonNullable<ChessBoard["clock"]> {
  const start = CHESS_CLOCK_START_MS;
  if (!clock) {
    return {
      w: start,
      b: start,
      msAt: now,
    };
  }
  const elapsed = Math.max(0, now - clock.msAt);
  const w = Math.max(0, clock.w - (turnIsWhite ? elapsed : 0));
  const b = Math.max(0, clock.b - (turnIsWhite ? 0 : elapsed));
  return {
    w,
    b,
    msAt: now,
  };
}

export function isSquare(v: unknown): v is string {
  return typeof v === "string" && /^[a-h][1-8]$/.test(v);
}

export function isPromotion(v: unknown): v is "q" | "r" | "b" | "n" {
  return v === "q" || v === "r" || v === "b" || v === "n";
}
