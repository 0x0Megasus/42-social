import { randomInt } from "node:crypto";
import { getRtdb, rtdb } from "@/lib/fbrdb";
import { readDB } from "@/lib/db";
import {
  freshTTT,
  tttWinner,
  tttFull,
  tttLegal,
  type TTTBoard,
  type TTTMark,
} from "@/lib/games/tictactoe";
import {
  CHESS_STARTPOS,
  freshChess,
  isPromotion,
  isSquare,
  type ChessBoard,
} from "@/lib/games/chess";
import { Chess } from "chess.js";
import {
  freshRPS,
  isRPSPick,
  rpsResolve,
  type RPSBoard,
  type RPSPick,
} from "@/lib/games/rps";
import {
  freshNumber,
  heatFor,
  isValidGuess,
  type NumberBoard,
} from "@/lib/games/number";
import {
  freshTwentyOne,
  handValue,
  type TwentyBoard,
} from "@/lib/games/twentyone";
import {
  freshC4,
  c4Winner,
  c4Full,
  c4Drop,
  type C4Board,
  type C4Mark,
} from "@/lib/games/connectfour";
import type {
  GameKind,
  GameRecord,
  GameRoom,
  GameView,
  MiniProfile,
} from "@/lib/games/types";

// Game rooms live under /games/{code} with per-room transactions —
// isolated from the social root so gameplay never contends with the feed.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

type AnyBoard =
  | TTTBoard
  | C4Board
  | RPSBoard
  | NumberBoard
  | TwentyBoard
  | ChessBoard;

function freshBoard(kind: GameKind, hostId = "", guestId = ""): AnyBoard {
  switch (kind) {
    case "tictactoe":
      return freshTTT();
    case "connectfour":
      return freshC4();
    case "rps":
      return freshRPS();
    case "number":
      return freshNumber();
    case "twentyone":
      return hostId && guestId
        ? freshTwentyOne(hostId, guestId)
        : { deck: [], hands: {}, stood: {} };
    case "chess":
      return freshChess();
  }
}

// Boards are stored as flat strings ("X..O....." / 42-char row-major)
// because RTDB strips nulls inside arrays, collapsing ["X",null×8] to ["X"].
const EMPTY_CELL = ".";

function encodeBoard(kind: GameKind, board: TTTBoard | C4Board): string {
  if (kind === "tictactoe") {
    const b = board as TTTBoard;
    return Array.from({ length: 9 }, (_, i) => b[i] ?? EMPTY_CELL).join("");
  }
  const b = board as C4Board;
  let s = "";
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 7; c++) s += b[r]?.[c] ?? EMPTY_CELL;
  return s;
}

function decodeBoard(kind: GameKind, raw: unknown): TTTBoard | C4Board | object {
  // Object boards (no nulls inside) pass through — per-kind defaults are
  // restored by normalizeRoom below. TTT/C4 use string encoding (null-safe).
  if (
    kind === "rps" ||
    kind === "number" ||
    kind === "twentyone" ||
    kind === "chess"
  ) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    return {};
  }
  const cell = (ch: unknown, marks: string[]): "X" | "O" | "R" | "Y" | null => {
    if (ch === marks[0]) return marks[0] as "X" | "R";
    if (ch === marks[1]) return marks[1] as "O" | "Y";
    return null;
  };
  if (kind === "tictactoe") {
    const marks = ["X", "O"];
    const chars =
      typeof raw === "string"
        ? Array.from(raw)
        : Array.isArray(raw)
          ? (raw as unknown[]).map((x) => String(x ?? EMPTY_CELL))
          : [];
    return Array.from(
      { length: 9 },
      (_, i) => cell(chars[i], marks) as TTTMark | null
    );
  }
  if (kind !== "connectfour") return {};
  const marks = ["R", "Y"];
  const grid = freshC4();
  if (typeof raw === "string" && raw.length >= 42) {
    const chars = Array.from(raw);
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 7; c++)
        grid[r][c] = cell(chars[r * 7 + c], marks) as C4Mark | null;
  } else if (Array.isArray(raw)) {
    // legacy array shape (may be ragged from null-stripping) — salvage cells
    const rows = raw as unknown[][];
    for (let r = 0; r < 6 && r < rows.length; r++) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      for (let c = 0; c < 7 && c < row.length; c++)
        grid[r][c] = cell(String(row[c] ?? EMPTY_CELL), marks) as C4Mark | null;
    }
  }
  return grid;
}

// RTDB drops empty/nullish nodes. Restore per-kind defaults on every read
// so engines never see undefined (and legacy array boards self-heal).
function normalizeRoom(room: GameRoom): GameRoom {
  room.board = decodeBoard(room.kind, room.board);
  if (room.kind === "rps") {
    const b = room.board as RPSBoard;
    b.picks ??= {};
    b.rounds ??= [];
    b.score ??= {};
    b.target ??= 3;
    for (const r of b.rounds) r.winner ??= null;
    room.board = b;
  } else if (room.kind === "number") {
    const b = room.board as NumberBoard;
    b.guesses ??= [];
    b.tries ??= {};
    if (typeof b.secret !== "number") b.secret = 50;
    room.board = b;
  } else if (room.kind === "twentyone") {
    const b = room.board as TwentyBoard;
    b.deck ??= [];
    b.hands ??= {};
    b.stood ??= {};
    room.board = b;
  } else if (room.kind === "chess") {
    const b = room.board as Partial<ChessBoard> as ChessBoard;
    if (typeof b.fen !== "string" || !b.fen) b.fen = CHESS_STARTPOS;
    b.history ??= [];
    room.board = b;
  }
  room.rematch ??= {};
  room.winLine ??= null;
  room.winnerId ??= null;
  room.guestId ??= null;
  return room;
}

export function markFor(room: GameRoom, userId: string): string | null {
  if (userId === room.hostId)
    return room.kind === "tictactoe"
      ? "X"
      : room.kind === "connectfour"
        ? "R"
        : room.kind === "chess"
          ? "White"
          : "P1";
  if (userId === room.guestId)
    return room.kind === "tictactoe"
      ? "O"
      : room.kind === "connectfour"
        ? "Y"
        : room.kind === "chess"
          ? "Black"
          : "P2";
  return null;
}

function toView(room: GameRoom, meId: string): GameView {
  const mark = markFor(room, meId);
  const seated = meId === room.hostId || meId === room.guestId;
  const opponentId =
    meId === room.hostId ? room.guestId : meId === room.guestId ? room.hostId : null;
  const playing = room.status === "playing";

  // Anti-cheat redaction: hidden state is stripped per viewer.
  // RPS hides the opponent's pending pick, Number hides the secret,
  // 21 hides the deck until the game ends.
  let board: unknown = room.board;
  let yourTurn = !!mark && playing && room.turn === meId;
  const oppAnswered: number | null = null;
  if (room.kind === "rps") {
    const b = room.board as RPSBoard;
    board =
      playing && meId in b.picks
        ? { ...b, picks: { [meId]: b.picks[meId] } }
        : { ...b, picks: {} };
    yourTurn = playing && seated && !(meId in b.picks);
  } else if (room.kind === "number") {
    const b = room.board as NumberBoard;
    board = playing ? { ...b, secret: 0 } : b;
  } else if (room.kind === "twentyone") {
    const b = room.board as TwentyBoard;
    board = playing ? { ...b, deck: [] } : b;
  } else if (room.kind === "chess") {
    // full information game — nothing hidden; turn from the position itself
    try {
      const g = new Chess((room.board as ChessBoard).fen);
      const mineWhite = meId === room.hostId;
      yourTurn = playing && seated && (g.turn() === "w") === mineWhite;
    } catch {
      yourTurn = false;
    }
  }
  return {
    ...room,
    board,
    myMark: mark,
    yourTurn,
    opponentId,
    oppAnswered,
    players: { host: null, guest: null },
  };
}

function mini(u: {
  id: string;
  name: string;
  login42: string | null;
  avatar: string | null;
} | null): MiniProfile | null {
  return u
    ? { id: u.id, name: u.name, login42: u.login42, avatar: u.avatar }
    : null;
}

// Attach public mini-profiles (names/avatars for the board header).
async function withPlayers(room: GameView): Promise<GameView> {
  const db = await readDB();
  const host = db.users.find((u) => u.id === room.hostId) ?? null;
  const guest = room.guestId
    ? (db.users.find((u) => u.id === room.guestId) ?? null)
    : null;
  return { ...room, players: { host: mini(host), guest: mini(guest) } };
}

async function getRoom(code: string): Promise<GameRoom | null> {
  const snap = await rtdb(`game.get:${code}`, () =>
    getRtdb().ref(`/games/${code}`).get()
  );
  const room = (snap.val() as GameRoom | null) ?? null;
  return room ? normalizeRoom(room) : null;
}

export async function createRoom(
  kind: GameKind,
  hostId: string
): Promise<GameView> {
  const db = getRtdb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newCode();
    const exists = await rtdb(`game.exists:${id}`, () =>
      getRtdb().ref(`/games/${id}`).get()
    );
    if (exists.exists()) continue;
    const now = new Date().toISOString();
    const fresh = freshBoard(kind, hostId, "");
    const room: GameRoom = {
      id,
      kind,
      hostId,
      guestId: null,
      board:
        kind === "tictactoe" || kind === "connectfour"
          ? encodeBoard(kind, fresh as TTTBoard | C4Board)
          : fresh,
      turn: hostId,
      starterId: hostId,
      status: "waiting",
      winnerId: null,
      winLine: null,
      round: 1,
      rematch: {},
      createdAt: now,
      updatedAt: now,
    };
    await rtdb(`game.create:${id}`, () =>
      db.ref(`/games/${id}`).set(room)
    );
    await rtdb(`game.link:${id}`, () =>
      db.ref(`/user-games/${hostId}/${id}`).set(true)
    );
    return withPlayers(toView(room, hostId));
  }
  throw new Error("could not allocate room code");
}

export async function viewRoom(
  code: string,
  meId: string
): Promise<GameView | null> {
  const room = await getRoom(code);
  return room ? withPlayers(toView(room, meId)) : null;
}

export async function joinRoom(
  code: string,
  meId: string
): Promise<{ room?: GameView; error?: "not-found" | "full" }> {
  // Pre-read: warms the client cache so the transaction updater below
  // never aborts on a local null-guess (RTDB runs it before server data).
  const existing = await getRoom(code);
  if (!existing) return { error: "not-found" };
  if (existing.hostId !== meId && existing.guestId && existing.guestId !== meId)
    return { error: "full" };
  const res = await rtdb("game.join", () =>
    getRtdb()
    .ref(`/games/${code}`)
    .transaction((current: unknown) => {
      const room = normalizeRoom((((current ?? existing) as GameRoom | null) ?? null) as GameRoom);
      if (!room) return;
      normalizeRoom(room);
      if (room.hostId === meId || room.guestId === meId) return room;
      if (room.guestId) return;
      room.guestId = meId;
      if (room.status === "waiting") {
        room.status = "playing";
        room.turn = room.starterId;
        if (room.kind === "twentyone") {
          room.board = freshTwentyOne(room.hostId, meId);
        }
      }
      room.updatedAt = new Date().toISOString();
      return room;
    }));
  if (!res.committed || !res.snapshot.val()) return { error: "not-found" };
  const joined = normalizeRoom(res.snapshot.val() as GameRoom);
  if (joined.hostId !== meId && joined.guestId !== meId) return { error: "full" };
  await rtdb(`game.link:${code}`, () =>
    getRtdb().ref(`/user-games/${meId}/${code}`).set(true)
  );
  return { room: await withPlayers(toView(joined, meId)) };
}

export type MoveInput = {
  cell?: number;
  col?: number;
  pick?: string;
  guess?: number;
  action?: string;
  from?: string;
  to?: string;
  promotion?: string;
};

export async function playMove(
  code: string,
  meId: string,
  input: MoveInput
): Promise<{ room?: GameView; error?: string }> {
  const existing = await getRoom(code);
  if (!existing) return { error: "not found" };
  const res = await rtdb("game.move", () =>
    getRtdb()
    .ref(`/games/${code}`)
    .transaction((current: unknown) => {
      const room = normalizeRoom((((current ?? existing) as GameRoom | null) ?? null) as GameRoom);
      if (!room) return;
      normalizeRoom(room);
      if (room.status !== "playing") return;
      const seated = meId === room.hostId || meId === room.guestId;
      if (!seated) return;
      // rps is free-play (picks don't touch the other side); everything
      // else strictly alternates via the turn field
      if (room.kind !== "rps" && room.turn !== meId) return;
      const mark = markFor(room, meId);
      if ((room.kind === "tictactoe" || room.kind === "connectfour") && !mark)
        return;
      if (room.kind === "tictactoe") {
        const board = room.board as TTTBoard;
        const cell = input.cell ?? -1;
        if (!tttLegal(board, cell)) return;
        board[cell] = mark as TTTMark;
        const win = tttWinner(board);
        if (win) {
          room.status = "over";
          room.winnerId = meId;
          room.winLine = win.line;
        } else if (tttFull(board)) {
          room.status = "over";
          room.winnerId = null;
        } else {
          room.turn = room.turn === room.hostId ? (room.guestId as string) : room.hostId;
        }
      } else if (room.kind === "connectfour") {
        const board = room.board as C4Board;
        const row = c4Drop(board, input.col ?? -1);
        if (row < 0) return;
        board[row][input.col as number] = mark as C4Mark;
        const win = c4Winner(board);
        if (win) {
          room.status = "over";
          room.winnerId = meId;
          room.winLine = win.line;
        } else if (c4Full(board)) {
          room.status = "over";
          room.winnerId = null;
        } else {
          room.turn = room.turn === room.hostId ? (room.guestId as string) : room.hostId;
        }
      } else if (room.kind === "rps") {
        const board = room.board as RPSBoard;
        if (!isRPSPick(input.pick) || board.picks[meId]) return;
        board.picks[meId] = input.pick;
        const other = meId === room.hostId ? room.guestId : room.hostId;
        if (other && board.picks[other]) {
          const hp = board.picks[room.hostId];
          const gp = room.guestId ? board.picks[room.guestId] : undefined;
          if (!hp || !gp) return;
          const res = rpsResolve(hp, gp);
          const winner =
            res === 0 ? null : res === 1 ? room.hostId : room.guestId;
          board.rounds.push({
            a: hp,
            b: gp,
            winner,
          });
          if (winner) board.score[winner] = (board.score[winner] ?? 0) + 1;
          board.picks = {};
          const target = board.target || 3;
          const hs = board.score[room.hostId] ?? 0;
          const gs = other ? (board.score[other] ?? 0) : 0;
          if (hs >= target || gs >= target) {
            room.status = "over";
            room.winnerId = hs >= target ? room.hostId : other;
          }
        }
        room.turn = other ?? meId;
      } else if (room.kind === "number") {
        const board = room.board as NumberBoard;
        if (!isValidGuess(input.guess)) return;
        const hint = heatFor(board.secret, input.guess as number);
        board.guesses.push({ by: meId, n: input.guess as number, hint });
        board.tries[meId] = (board.tries[meId] ?? 0) + 1;
        if (hint === "exact") {
          room.status = "over";
          room.winnerId = meId;
        } else {
          room.turn = room.turn === room.hostId ? (room.guestId as string) : room.hostId;
        }
      } else if (room.kind === "twentyone") {
        const board = room.board as TwentyBoard;
        if (input.action !== "hit" && input.action !== "stand") return;
        const other = meId === room.hostId ? room.guestId : room.hostId;
        const finish = () => {
          // both stood (or bust) — decide
          const hv = (id: string | null) =>
            id ? handValue(board.hands[id] ?? []) : -1;
          const myV = hv(meId);
          const opV = hv(other);
          const myBust = myV > 21;
          const opBust = opV > 21;
          if (myBust && opBust) room.winnerId = null;
          else if (myBust) room.winnerId = other;
          else if (opBust) room.winnerId = meId;
          else if (myV === opV) room.winnerId = null;
          else room.winnerId = myV > opV ? meId : other;
          room.status = "over";
        };
        if (input.action === "hit") {
          const card = board.deck.pop();
          if (card === undefined) return;
          const hand = [...(board.hands[meId] ?? []), card];
          board.hands[meId] = hand;
          const v = handValue(hand);
          if (v > 21) {
            finish();
          } else {
            if (v === 21) board.stood[meId] = true;
            if (other && board.stood[other]) finish();
            else
              room.turn =
                room.turn === room.hostId ? (room.guestId as string) : room.hostId;
          }
        } else {
          board.stood[meId] = true;
          if (other && board.stood[other]) finish();
          else
            room.turn =
              room.turn === room.hostId ? (room.guestId as string) : room.hostId;
        }
      } else if (room.kind === "chess") {
        const b = room.board as ChessBoard;
        if (!isSquare(input.from) || !isSquare(input.to)) return;
        const meWhite = meId === room.hostId;
        let game: Chess;
        try {
          game = new Chess(b.fen);
        } catch {
          return;
        }
        if ((game.turn() === "w") !== meWhite) return;
        let san: string;
        try {
          const mv = game.move({
            from: input.from,
            to: input.to,
            promotion: isPromotion(input.promotion) ? input.promotion : "q",
          });
          san = mv.san;
        } catch {
          return;
        }
        b.fen = game.fen();
        b.history.push(san);
        if (game.isCheckmate()) {
          room.status = "over";
          room.winnerId = meId;
        } else if (game.isStalemate() || game.isDraw()) {
          room.status = "over";
          room.winnerId = null;
        } else {
          room.turn = room.turn === room.hostId ? (room.guestId as string) : room.hostId;
        }
      }
      // records resolved at game end, atomically with the result
      room.updatedAt = new Date().toISOString();
      // re-encode string-boards: RTDB strips nulls inside arrays
      if (room.kind === "tictactoe" || room.kind === "connectfour") {
        room.board = encodeBoard(
          room.kind,
          room.board as TTTBoard | C4Board
        );
      }
      return room;
    }));
  if (!res.committed || !res.snapshot.val())
    return { error: "illegal move" };
  const rawRoom = res.snapshot.val() as GameRoom;
  const room = normalizeRoom(rawRoom);
  if (room.status === "over") {
    await recordResult(room).catch(() => null);
  }
  return { room: await withPlayers(toView(room, meId)) };
}

async function recordResult(room: GameRoom): Promise<void> {
  const db = getRtdb();
  const ids = [room.hostId, room.guestId].filter(Boolean) as string[];
  await Promise.all(
    ids.map((id) =>
      rtdb(`records:${id}/${room.kind}`, () =>
        db.ref(`/records/${id}/${room.kind}`).transaction((cur: unknown) => {
        const r = (cur as GameRecord | null) ?? { w: 0, l: 0, d: 0 };
        if (room.winnerId === null) r.d += 1;
        else if (room.winnerId === id) r.w += 1;
        else r.l += 1;
        return r;
      }))
    )
  );
}

export async function rematch(
  code: string,
  meId: string
): Promise<{ room?: GameView; error?: string }> {
  const existing = await getRoom(code);
  if (!existing) return { error: "not ready" };
  const res = await rtdb("game.rematch", () =>
    getRtdb()
    .ref(`/games/${code}`)
    .transaction((current: unknown) => {
      const room = normalizeRoom(
        ((current ?? existing) as GameRoom | null) ?? existing
      );
      if (
        room.status !== "over" ||
        (room.hostId !== meId && room.guestId !== meId)
      )
        return;
      room.rematch ??= {};
      room.rematch[meId] = true;
      const other = meId === room.hostId ? room.guestId : room.hostId;
      if (other && room.rematch[other]) {
        // both ready — new round; chess swaps colors (White always moves
        // first), everything else alternates the starter for fairness
        if (room.kind === "chess" && room.guestId) {
          const h = room.hostId;
          room.hostId = room.guestId;
          room.guestId = h;
        }
        const nextStarter =
          room.kind === "chess"
            ? room.hostId
            : room.starterId === room.hostId
              ? room.guestId
              : room.hostId;
        room.board = encodeBoard(
          room.kind,
          freshBoard(room.kind) as TTTBoard | C4Board
        );
        room.starterId = nextStarter ?? room.hostId;
        room.turn = room.starterId;
        room.status = "playing";
        room.winnerId = null;
        room.winLine = null;
        room.rematch = {};
        room.round += 1;
      }
      room.updatedAt = new Date().toISOString();
      return room;
    }));
  if (!res.committed || !res.snapshot.val())
    return { error: "not ready" };
  const done = normalizeRoom(res.snapshot.val() as GameRoom);
  return { room: await withPlayers(toView(done, meId)) };
}

// Leave = forfeit (winner = the other player). Host leaving an empty
// waiting room deletes it instead. Leaving a finished game just unlinks
// it from your list so you can walk away.
export async function leaveRoom(
  code: string,
  meId: string
): Promise<{ room?: GameView; deleted?: boolean; left?: boolean; error?: string }> {
  const db = getRtdb();
  const room = await getRoom(code);
  if (!room || (room.hostId !== meId && room.guestId !== meId))
    return { error: "not found" };
  if (room.status === "waiting" && !room.guestId && room.hostId === meId) {
    await Promise.all([
      rtdb("game.delete", () => db.ref(`/games/${code}`).remove()),
      rtdb("game.unlink", () => db.ref(`/user-games/${meId}/${code}`).remove()),
    ]);
    return { deleted: true };
  }
  if (room.status !== "playing") {
    await rtdb(`game.unlink:${code}`, () =>
      db.ref(`/user-games/${meId}/${code}`).remove()
    );
    return { left: true, room: await withPlayers(toView(room, meId)) };
  }
  const other = meId === room.hostId ? room.guestId : room.hostId;
  const existing = room;
  const res = await rtdb("game.leave-tx", () =>
    db
    .ref(`/games/${code}`)
    .transaction((current: unknown) => {
      const r = ((current ?? existing) as GameRoom | null) ?? null;
      if (!r || r.status !== "playing") return;
      r.status = "over";
      r.winnerId = other;
      r.updatedAt = new Date().toISOString();
      return r;
    }));
  if (!res.committed || !res.snapshot.val())
    return { error: "not ready" };
  const done = normalizeRoom(res.snapshot.val() as GameRoom);
  await recordResult(done).catch(() => null);
  return { room: await withPlayers(toView(done, meId)) };
}

export async function userGames(meId: string): Promise<GameView[]> {
  const db = getRtdb();
  const idx = await rtdb(`user-games:${meId}`, () =>
    db.ref(`/user-games/${meId}`).get()
  );
  const val = (idx.val() ?? {}) as Record<string, boolean>;
  const codes = Object.keys(val).slice(-20);
  const rooms = await Promise.all(codes.map((c) => getRoom(c)));
  const views = await Promise.all(
    rooms
      .filter((r): r is GameRoom => !!r)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((r) => withPlayers(toView(r, meId)))
  );
  return views;
}

export async function getRecords(
  userId: string
): Promise<Record<string, GameRecord>> {
  const snap = await rtdb(`records:${userId}`, () =>
    getRtdb().ref(`/records/${userId}`).get()
  );
  return (snap.val() ?? {}) as Record<string, GameRecord>;
}
