// Chess board state: FEN string (RTDB-safe, no nulls) + SAN history.
export type ChessBoard = {
  fen: string;
  history: string[];
};

export const CHESS_STARTPOS =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function freshChess(): ChessBoard {
  return { fen: CHESS_STARTPOS, history: [] };
}

export function isSquare(v: unknown): v is string {
  return typeof v === "string" && /^[a-h][1-8]$/.test(v);
}

export function isPromotion(v: unknown): v is "q" | "r" | "b" | "n" {
  return v === "q" || v === "r" || v === "b" || v === "n";
}
