export type GameKind =
  | "tictactoe"
  | "connectfour"
  | "rps"
  | "number"
  | "twentyone"
  | "chess";
export type GameStatus = "waiting" | "playing" | "over";

export type GameRoom = {
  id: string;
  kind: GameKind;
  hostId: string;
  guestId: string | null;
  // kind-specific state (see engines)
  board: unknown;
  turn: string; // userId to move
  starterId: string; // who moved first this round (swaps on rematch)
  status: GameStatus;
  winnerId: string | null; // null = draw / undecided
  winLine: unknown; // engine-provided winning cells, if any
  round: number;
  rematch: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
};

export type GameRecord = { w: number; l: number; d: number };

export type GameView = GameRoom & {
  // per-viewer extras computed server-side (never trust the client)
  myMark: string | null;
  yourTurn: boolean;
  opponentId: string | null;
  // reserved for per-viewer extras (unused for current games)
  oppAnswered: number | null;
  players: {
    host: MiniProfile | null;
    guest: MiniProfile | null;
  };
};

export type MiniProfile = {
  id: string;
  name: string;
  login42: string | null;
  avatar: string | null;
};

export const GAME_LABEL: Record<GameKind, string> = {
  tictactoe: "Tic-Tac-Toe",
  connectfour: "Connect Four",
  rps: "Rock-Paper-Scissors",
  number: "Number Duel",
  twentyone: "21 Duel",
  chess: "Chess",
};
