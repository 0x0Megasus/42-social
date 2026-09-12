// Pure Connect Four engine — 6 rows x 7 cols, gravity drops.
// Board[row][col], row 0 = top.
export type C4Mark = "R" | "Y";
export type C4Board = (C4Mark | null)[][];

export const C4_ROWS = 6;
export const C4_COLS = 7;

export function freshC4(): C4Board {
  return Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(null));
}

// Returns the row a disc lands on, or -1 when the column is full/invalid.
export function c4Drop(board: C4Board, col: number): number {
  if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) return -1;
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (!board[r][col]) return r;
  }
  return -1;
}

export function c4Winner(board: C4Board): {
  winner: C4Mark;
  line: [number, number][];
} | null {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const mark = board[r][c];
      if (!mark) continue;
      for (const [dr, dc] of dirs) {
        const line: [number, number][] = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (
            nr < 0 ||
            nr >= C4_ROWS ||
            nc < 0 ||
            nc >= C4_COLS ||
            board[nr][nc] !== mark
          )
            break;
          line.push([nr, nc]);
        }
        if (line.length === 4) return { winner: mark, line };
      }
    }
  }
  return null;
}

export function c4Full(board: C4Board): boolean {
  return board[0].every((c) => c !== null);
}
