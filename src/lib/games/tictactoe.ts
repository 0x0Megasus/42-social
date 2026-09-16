export type TTTMark = "X" | "O";
export type TTTBoard = (TTTMark | null)[];

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function freshTTT(): TTTBoard {
  return Array(9).fill(null);
}

export function tttWinner(board: TTTBoard): {
  winner: TTTMark;
  line: number[];
} | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as TTTMark, line };
    }
  }
  return null;
}

export function tttFull(board: TTTBoard): boolean {
  return board.every((c) => c !== null);
}

export function tttLegal(board: TTTBoard, cell: number): boolean {
  return (
    Number.isInteger(cell) && cell >= 0 && cell < 9 && board[cell] === null
  );
}
