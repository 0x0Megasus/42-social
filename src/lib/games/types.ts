export type GameKind =
  | "tictactoe"
  | "connectfour"
  | "rps"
  | "number"
  | "twentyone"
  | "chess"
  | "backrooms";
export type GameStatus = "waiting" | "playing" | "over";

export type BackroomsMode = "solo" | "duel";

export type RunResult = {
  score: number;
  kills: number;
  wave: number;
  time: number; // seconds survived / clear time
  won: boolean; // true = escaped
};

export type BackroomsBoard = {
  seed: number;
};

export type GameRoom = {
  id: string;
  kind: GameKind;
  hostId: string;
  guestId: string | null;
  board: unknown;
  turn: string; // userId to move
  starterId: string; // who moved first this round (swaps on rematch)
  status: GameStatus;
  winnerId: string | null; // null = draw / undecided
  winLine: unknown; // engine-provided winning cells, if any
  round: number;
  rematch: Record<string, boolean>;
  mode?: BackroomsMode; // solo = instant start, duel = host + guest
  seed?: number | null; // shared maze seed for the round
  scores?: Record<string, RunResult>; // one entry per submitted seat
  createdAt: string;
  updatedAt: string;
};

export type GameRecord = { w: number; l: number; d: number; best?: number };

export type GameView = GameRoom & {
  myMark: string | null;
  yourTurn: boolean;
  opponentId: string | null;
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
  backrooms: "Backrooms: No-Clip",
};
