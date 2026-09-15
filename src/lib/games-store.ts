import { randomInt } from "node:crypto";
import { after } from "next/server";
import { getRtdb, rtdb } from "@/lib/fbrdb";
import {
  botInputFor,
  botKindOf,
  botProfile,
  isBotId,
} from "@/lib/games/bot";
import { tickChessClock } from "@/lib/games/chess";
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
  BackroomsBoard,
  BackroomsMode,
  GameKind,
  GameRecord,
  GameRoom,
  GameView,
  MiniProfile,
  RunResult,
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
  | ChessBoard
  | BackroomsBoard;

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
    case "backrooms":
      return { seed: 0 };
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
    kind === "chess" ||
    kind === "backrooms"
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
  } else if (room.kind === "backrooms") {
    const b = room.board as Partial<BackroomsBoard> as BackroomsBoard;
    if (typeof b.seed !== "number") b.seed = room.seed ?? 0;
    room.board = b;
  }
  room.rematch ??= {};
  room.winLine ??= null;
  room.winnerId ??= null;
  room.guestId ??= null;
  if (room.kind === "backrooms") {
    room.mode ??= "solo";
    room.seed ??= null;
    room.scores ??= {};
  }
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
  // 21 hides the deck until the game ends, Backrooms hides the opponent's
  // run result until both duelists have submitted (or the room is over).
  let board: unknown = room.board;
  let yourTurn = !!mark && playing && room.turn === meId;
  let scoresOut = room.scores;
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
  } else if (room.kind === "backrooms") {
    // No turns — a seat is "active" until it submits its run. The client
    // boots the maze from board.seed; results reveal when both are in.
    const scores = room.scores ?? {};
    const mine = scores[meId];
    const other =
      meId === room.hostId
        ? room.guestId
        : meId === room.guestId
          ? room.hostId
          : null;
    const otherIn = !!other && !!scores[other];
    const bothIn = !!mine && (room.mode !== "duel" || otherIn);
    const revealed = room.status === "over" || bothIn;
    yourTurn = playing && seated && !mine;
    board = {
      seed: (room.board as BackroomsBoard).seed ?? room.seed ?? 0,
      submitted: !!mine,
      oppSubmitted: otherIn,
      myScore: mine ?? null,
      results: revealed ? scores : null,
    } as BackroomsBoard & {
      submitted: boolean;
      oppSubmitted: boolean;
      myScore: RunResult | null;
      results: Record<string, RunResult> | null;
    };
    scoresOut = revealed ? scores : mine ? { [meId]: mine } : {};
  }
  return {
    ...room,
    board,
    scores: scoresOut,
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

// Profile lookups used to readDB() — the ENTIRE root (users+posts+comments+
// messages) — on every game request. Names/avatars change rarely, so a short
// single-flight cache keeps headers correct while cutting ~all of that cost.
const PROFILE_TTL_MS = 5_000;
const profileCache = new Map<
  string,
  { at: number; promise: Promise<MiniProfile | null> }
>();

async function fetchProfile(id: string): Promise<MiniProfile | null> {
  const db = await readDB();
  const u = db.users.find((x) => x.id === id) ?? null;
  return mini(u);
}

async function cachedProfile(id: string): Promise<MiniProfile | null> {
  const hit = profileCache.get(id);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.promise;
  const promise = fetchProfile(id).catch(() => null);
  profileCache.set(id, { at: Date.now(), promise });
  // opportunistic pruning (cache only ever holds a handful of ids)
  if (profileCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of profileCache)
      if (now - v.at > PROFILE_TTL_MS * 2) profileCache.delete(k);
  }
  return promise;
}

// Attach public mini-profiles (names/avatars for the board header).
// Bot seats render a synthetic profile — no DB lookup.
async function withPlayers(room: GameView): Promise<GameView> {
  const host = isBotId(room.hostId)
    ? botProfile(botKindOf(room.hostId))
    : await cachedProfile(room.hostId);
  const guest = room.guestId
    ? isBotId(room.guestId)
      ? botProfile(botKindOf(room.guestId))
      : await cachedProfile(room.guestId)
    : null;
  return { ...room, players: { host, guest } };
}

export async function getRoom(code: string): Promise<GameRoom | null> {
  const snap = await rtdb(`game.get:${code}`, () =>
    getRtdb().ref(`/games/${code}`).get()
  );
  const room = (snap.val() as GameRoom | null) ?? null;
  return room ? normalizeRoom(room) : null;
}

export async function createRoom(
  kind: GameKind,
  hostId: string,
  opts?: { vsBot?: boolean; mode?: BackroomsMode }
): Promise<GameView> {
  const db = getRtdb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newCode();
    const exists = await rtdb(`game.exists:${id}`, () =>
      getRtdb().ref(`/games/${id}`).get()
    );
    if (exists.exists()) continue;
    const now = new Date().toISOString();
    // Backrooms has no bot — vsBot is ignored; mode selects solo/duel.
    const botGuest =
      opts?.vsBot && kind !== "backrooms" ? `bot:${kind}` : null;
    const mode: BackroomsMode | undefined =
      kind === "backrooms" ? (opts?.mode === "duel" ? "duel" : "solo") : undefined;
    const seed = kind === "backrooms" ? randomInt(2 ** 31) : undefined;
    const fresh = freshBoard(kind, hostId, botGuest ?? "");
    const room: GameRoom = {
      id,
      kind,
      hostId,
      guestId: botGuest,
      board:
        kind === "tictactoe" || kind === "connectfour"
          ? encodeBoard(kind, fresh as TTTBoard | C4Board)
          : kind === "backrooms"
            ? { seed: seed as number }
            : fresh,
      turn: hostId,
      starterId: hostId,
      status: botGuest || mode === "solo" ? "playing" : "waiting",
      winnerId: null,
      winLine: null,
      round: 1,
      rematch: {},
      ...(mode !== undefined ? { mode } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(kind === "backrooms" ? { scores: {} } : {}),
      createdAt: now,
      updatedAt: now,
    };
    if (botGuest) {
      // Bot games start immediately; 21 deals hands, chess starts its clock.
      normalizeRoom(room);
      startClockIfChess(room);
      runBotIfNeeded(room);
      room.updatedAt = now;
      if (room.kind === "tictactoe" || room.kind === "connectfour") {
        room.board = encodeBoard(
          room.kind,
          room.board as TTTBoard | C4Board
        );
      }
    }
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

// Build a per-viewer room view from a raw RTDB snapshot value — used by the
// SSE stream so push events don't need an extra GET round-trip per update.
export async function buildView(
  raw: GameRoom,
  meId: string
): Promise<GameView> {
  return withPlayers(toView(normalizeRoom(raw), meId));
}

export async function joinRoom(
  code: string,
  meId: string
): Promise<{ room?: GameView; error?: "not-found" | "full" }> {
  // Pre-read: warms the client cache so the transaction updater below
  // never aborts on a local null-guess (RTDB runs it before server data).
  const existing = await getRoom(code);
  if (!existing) return { error: "not-found" };
  if (
    existing.hostId !== meId &&
    existing.guestId &&
    existing.guestId !== meId &&
    !isBotId(existing.guestId)
  )
    return { error: "full" };
  if (isBotId(existing.guestId) && existing.hostId !== meId)
    return { error: "full" }; // spectators may watch a bot game, not join it
  const res = await rtdb("game.join", () =>
    getRtdb()
    .ref(`/games/${code}`)
    .transaction((current: unknown) => {
      const room = normalizeRoom((((current ?? existing) as GameRoom | null) ?? null) as GameRoom);
      if (!room) return;
      normalizeRoom(room);
      if (room.hostId === meId || room.guestId === meId) return room;
      if (isBotId(room.guestId)) return; // bot seat is never joinable
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

// Pure per-kind move application. Shared by human moves AND bot replies so
// both go through identical validation + win detection. `playerId` may be a
// bot id. Returns false when the move is illegal (room untouched).
function applyMoveFor(
  room: GameRoom,
  playerId: string,
  input: MoveInput
): boolean {
  const mark = markFor(room, playerId);
  if ((room.kind === "tictactoe" || room.kind === "connectfour") && !mark)
    return false;
  if (room.kind === "tictactoe") {
    const board = room.board as TTTBoard;
    const cell = input.cell ?? -1;
    if (!tttLegal(board, cell)) return false;
    board[cell] = mark as TTTMark;
    const win = tttWinner(board);
    if (win) {
      room.status = "over";
      room.winnerId = playerId;
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
    if (row < 0) return false;
    board[row][input.col as number] = mark as C4Mark;
    const win = c4Winner(board);
    if (win) {
      room.status = "over";
      room.winnerId = playerId;
      room.winLine = win.line;
    } else if (c4Full(board)) {
      room.status = "over";
      room.winnerId = null;
    } else {
      room.turn = room.turn === room.hostId ? (room.guestId as string) : room.hostId;
    }
  } else if (room.kind === "rps") {
    const board = room.board as RPSBoard;
    if (!isRPSPick(input.pick) || board.picks[playerId]) return false;
    board.picks[playerId] = input.pick;
    const other = playerId === room.hostId ? room.guestId : room.hostId;
    if (other && board.picks[other]) {
      const hp = board.picks[room.hostId];
      const gp = room.guestId ? board.picks[room.guestId] : undefined;
      if (!hp || !gp) return false;
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
    room.turn = other ?? playerId;
  } else if (room.kind === "number") {
    const board = room.board as NumberBoard;
    if (!isValidGuess(input.guess)) return false;
    const hint = heatFor(board.secret, input.guess as number);
    board.guesses.push({ by: playerId, n: input.guess as number, hint });
    board.tries[playerId] = (board.tries[playerId] ?? 0) + 1;
    if (hint === "exact") {
      room.status = "over";
      room.winnerId = playerId;
    } else {
      room.turn = room.turn === room.hostId ? (room.guestId as string) : room.hostId;
    }
  } else if (room.kind === "twentyone") {
    const board = room.board as TwentyBoard;
    if (input.action !== "hit" && input.action !== "stand") return false;
    const other = playerId === room.hostId ? room.guestId : room.hostId;
    const finish = () => {
      const hv = (id: string | null) =>
        id ? handValue(board.hands[id] ?? []) : -1;
      const myV = hv(playerId);
      const opV = hv(other);
      const myBust = myV > 21;
      const opBust = opV > 21;
      if (myBust && opBust) room.winnerId = null;
      else if (myBust) room.winnerId = other;
      else if (opBust) room.winnerId = playerId;
      else if (myV === opV) room.winnerId = null;
      else room.winnerId = myV > opV ? playerId : other;
      room.status = "over";
    };
    if (input.action === "hit") {
      const card = board.deck.pop();
      if (card === undefined) return false;
      const hand = [...(board.hands[playerId] ?? []), card];
      board.hands[playerId] = hand;
      const v = handValue(hand);
      if (v > 21) {
        finish();
      } else {
        if (v === 21) board.stood[playerId] = true;
        if (other && board.stood[other]) finish();
        else
          room.turn =
            room.turn === room.hostId ? (room.guestId as string) : room.hostId;
      }
    } else {
      board.stood[playerId] = true;
      if (other && board.stood[other]) finish();
      else
        room.turn =
          room.turn === room.hostId ? (room.guestId as string) : room.hostId;
    }
  } else if (room.kind === "chess") {
    const b = room.board as ChessBoard;
    if (!isSquare(input.from) || !isSquare(input.to)) return false;
    const meWhite = playerId === room.hostId;
    let game: Chess;
    try {
      game = new Chess(b.fen);
    } catch {
      return false;
    }
    if ((game.turn() === "w") !== meWhite) return false;
    let san: string;
    try {
      const mv = game.move({
        from: input.from,
        to: input.to,
        promotion: isPromotion(input.promotion) ? input.promotion : "q",
      });
      san = mv.san;
    } catch {
      return false;
    }
    b.fen = game.fen();
    b.history.push(san);
    if (game.isCheckmate()) {
      room.status = "over";
      room.winnerId = playerId;
    } else if (game.isStalemate() || game.isDraw()) {
      room.status = "over";
      room.winnerId = null;
    } else {
      room.turn = room.turn === room.hostId ? (room.guestId as string) : room.hostId;
    }
  }
  return true;
}

// Seed fresh clocks once a chess room starts.
function startClockIfChess(room: GameRoom): void {
  if (room.kind !== "chess") return;
  const b = room.board as ChessBoard;
  b.clock = tickChessClock(b.clock ?? null, Date.now(), true);
}

// While it's the bot's turn inside a bot room, compute + apply its reply
// atomically in the same transaction. Mutates `room`; returns void.
// NOTE: only used for instant setup (room creation / rematch when the bot
// does NOT start). Live replies go through scheduleBotReply() with a
// human-like delay — see below.
function runBotIfNeeded(room: GameRoom): void {
  const botIsHost = isBotId(room.hostId);
  const botIsGuest = isBotId(room.guestId);
  if (!botIsHost && !botIsGuest) return;
  let guard = 0;
  while (room.status === "playing" && (botIsHost ? room.turn === room.hostId : room.turn === room.guestId) && guard < 20) {
    guard += 1;
    const botId = botIsHost ? (room.hostId as string) : (room.guestId as string);
    const input = botInputFor(room.kind, room.board, botId);
    if (!input) break;
    if (!applyMoveFor(room, botId, input)) break;
    // rps: bot pick alone doesn't flip play — loop exits via the turn check
  }
}

// Human-like bot pacing: the bot used to reply inside the SAME transaction
// as the human move (zero latency — felt instant/robotic). Now the human
// move commits first and the bot answers ~1s later in its own transaction,
// pushed to the tab via SSE/poll like a real opponent.
const BOT_REPLY_MIN_MS = 400;
const BOT_REPLY_JITTER_MS = 200;

function botToMove(room: GameRoom): string | null {
  if (room.status !== "playing") return null;
  if (isBotId(room.hostId) && room.turn === room.hostId) return room.hostId;
  if (room.guestId && isBotId(room.guestId) && room.turn === room.guestId)
    return room.guestId;
  return null;
}

async function applyDelayedBotMove(code: string): Promise<void> {
  const delay =
    BOT_REPLY_MIN_MS + randomInt(BOT_REPLY_JITTER_MS + 1);
  await new Promise((r) => setTimeout(r, delay));
  const existing = await getRoom(code);
  if (!existing || !botToMove(existing)) return;
  await rtdb("game.bot", () =>
    getRtdb()
      .ref(`/games/${code}`)
      .transaction((current: unknown) => {
        const room = normalizeRoom(
          (((current ?? existing) as GameRoom | null) ?? null) as GameRoom
        );
        if (!room) return;
        normalizeRoom(room);
        if (room.status !== "playing") return;
        const firstBot = botToMove(room);
        if (!firstBot) return; // human moved on / game over — abort
        // Chess: charge the bot for its think time (incl. the delay above).
        if (room.kind === "chess") {
          const b = room.board as ChessBoard;
          const botWhite = firstBot === room.hostId;
          b.clock = tickChessClock(b.clock ?? null, Date.now(), botWhite);
          const botAtZero = botWhite ? b.clock.w <= 0 : b.clock.b <= 0;
          const humanAtZero = botWhite ? b.clock.b <= 0 : b.clock.w <= 0;
          if (botAtZero || humanAtZero) {
            room.status = "over";
            room.winnerId = botAtZero
              ? ((botWhite ? room.guestId : room.hostId) as string)
              : firstBot;
            room.updatedAt = new Date().toISOString();
            return room;
          }
        }
        let moved = false;
        let guard = 0;
        while (room.status === "playing" && botToMove(room) && guard < 20) {
          guard += 1;
          const botId = botToMove(room) as string;
          const botInput = botInputFor(room.kind, room.board, botId);
          if (!botInput) break;
          if (!applyMoveFor(room, botId, botInput)) break;
          moved = true;
        }
        if (!moved) return; // abort — nothing to write
        room.updatedAt = new Date().toISOString();
        if (room.kind === "tictactoe" || room.kind === "connectfour") {
          room.board = encodeBoard(
            room.kind,
            room.board as TTTBoard | C4Board
          );
        }
        return room;
      })
  ).catch(() => null);
}

function scheduleBotReply(code: string, room: GameRoom): void {
  if (!botToMove(room)) return;
  after(() => applyDelayedBotMove(code).catch(() => null));
}

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
      // Chess clock: charge the mover for the elapsed think time before the
      // move is applied. Whoever's clock is at 0 loses on time (mover first
      // — they were the one thinking when their flag fell).
      if (room.kind === "chess") {
        const b = room.board as ChessBoard;
        const moverWhite = meId === room.hostId;
        b.clock = tickChessClock(b.clock ?? null, Date.now(), moverWhite);
        const moverAtZero = moverWhite ? b.clock.w <= 0 : b.clock.b <= 0;
        const oppAtZero = moverWhite ? b.clock.b <= 0 : b.clock.w <= 0;
        if (moverAtZero || oppAtZero) {
          room.status = "over";
          room.winnerId = moverAtZero
            ? (moverWhite ? (room.guestId as string) : (room.hostId as string))
            : meId;
          room.updatedAt = new Date().toISOString();
          return room;
        }
      }
      if (!applyMoveFor(room, meId, input)) return;
      // Bot reply is NOT applied here anymore: the human move commits first
      // and the bot answers ~1s later (scheduleBotReply after commit),
      // so it feels like a real opponent instead of an instant echo.
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
  // recordResult stalls the winning player's response by a full extra RTDB
  // round-trip right at the victory moment. after() (Next 16) runs it after
  // the response is flushed — same guarantees, zero perceived latency.
  if (room.status === "over") {
    after(() => recordResult(room).catch(() => null));
  } else {
    scheduleBotReply(code, room);
  }
  return { room: await withPlayers(toView(room, meId)) };
}

// ---------------- backrooms: submit-a-run ----------------

// Server-side bounds for a submitted run. Generous ceilings (a perfect
// escape is ~7.5k + kill bonuses) — the point is rejecting garbage and
// hand-edited payloads, not policing skill.
const RUN_BOUNDS = {
  score: 100_000_000,
  kills: 1_000_000,
  wave: 6,
  time: 86_400,
} as const;

export function sanitizeRunResult(input: unknown): RunResult | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const score = num(r.score);
  const kills = num(r.kills);
  const wave = num(r.wave);
  const time = num(r.time);
  if (score === null || kills === null || wave === null || time === null)
    return null;
  if (
    score < 0 || score > RUN_BOUNDS.score ||
    kills < 0 || kills > RUN_BOUNDS.kills ||
    wave < 1 || wave > RUN_BOUNDS.wave ||
    time < 0 || time > RUN_BOUNDS.time ||
    typeof r.won !== "boolean"
  )
    return null;
  return {
    score: Math.floor(score),
    kills: Math.floor(kills),
    wave: Math.floor(wave),
    time,
    won: r.won,
  };
}

/**
 * Duel verdict from two submitted runs. Higher score wins; exact score tie
 * breaks on faster clear time; perfect tie is a draw (null). Pure — unit
 * tested in lib/__tests__/backrooms.test.ts.
 */
export function decideBackroomsWinner(
  hostId: string,
  guestId: string | null,
  scores: Record<string, RunResult>,
): string | null {
  const h = scores[hostId];
  const g = guestId ? scores[guestId] : undefined;
  if (!h) return null;
  if (!g) return hostId; // solo, or guest never submitted
  if (h.score !== g.score) return h.score > g.score ? hostId : guestId;
  if (h.time !== g.time) return h.time < g.time ? hostId : guestId;
  return null;
}

// Submit one FPS run. No turns: any seated player in a playing backrooms
// room may submit once. Solo settles immediately; duel settles when both
// seats are in (the pending opponent stays redacted in toView until then).
export async function submitResult(
  code: string,
  meId: string,
  input: unknown,
): Promise<{ room?: GameView; error?: string }> {
  const result = sanitizeRunResult(input);
  if (!result) return { error: "invalid result" };
  const existing = await getRoom(code);
  if (!existing) return { error: "not found" };
  const res = await rtdb("game.submit", () =>
    getRtdb()
      .ref(`/games/${code}`)
      .transaction((current: unknown) => {
        const room = normalizeRoom(
          (((current ?? existing) as GameRoom | null) ?? null) as GameRoom,
        );
        if (!room) return;
        normalizeRoom(room);
        if (room.kind !== "backrooms" || room.status !== "playing") return;
        if (room.hostId !== meId && room.guestId !== meId) return;
        room.scores ??= {};
        if (room.scores[meId]) return; // already submitted — abort
        room.scores[meId] = result;
        const guestIn = !room.guestId || !!room.scores[room.guestId];
        if (room.mode !== "duel" || guestIn) {
          room.status = "over";
          room.winnerId = decideBackroomsWinner(
            room.hostId,
            room.guestId,
            room.scores,
          );
        }
        room.updatedAt = new Date().toISOString();
        return room;
      }),
  );
  if (!res.committed || !res.snapshot.val())
    return { error: "not ready" };
  const done = normalizeRoom(res.snapshot.val() as GameRoom);
  if (done.status === "over") {
    after(() => recordResult(done).catch(() => null));
  }
  return { room: await withPlayers(toView(done, meId)) };
}

// Forfeit on time (clock hit 0 while you were thinking).
export async function flagRoom(
  code: string,
  meId: string
): Promise<{ room?: GameView; error?: string }> {
  const existing = await getRoom(code);
  if (!existing) return { error: "not found" };
  const res = await rtdb("game.flag", () =>
    getRtdb()
    .ref(`/games/${code}`)
    .transaction((current: unknown) => {
      const room = normalizeRoom((((current ?? existing) as GameRoom | null) ?? null) as GameRoom);
      if (!room) return;
      if (room.kind !== "chess" || room.status !== "playing") return;
      if (room.hostId !== meId && room.guestId !== meId) return;
      const b = room.board as ChessBoard;
      const whiteToMove = room.turn === room.hostId;
      b.clock = tickChessClock(b.clock ?? null, Date.now(), whiteToMove);
      if (b.clock.w > 0 && b.clock.b > 0) {
        // still time on both clocks — nothing to flag
        room.updatedAt = new Date().toISOString();
        return room;
      }
      room.status = "over";
      room.winnerId = b.clock.w <= 0
        ? (room.guestId as string)
        : (room.hostId as string);
      room.updatedAt = new Date().toISOString();
      return room;
    }));
  if (!res.committed || !res.snapshot.val())
    return { error: "not ready" };
  const done = normalizeRoom(res.snapshot.val() as GameRoom);
  if (done.status === "over") {
    after(() => recordResult(done).catch(() => null));
  }
  return { room: await withPlayers(toView(done, meId)) };
}

async function recordResult(room: GameRoom): Promise<void> {
  const db = getRtdb();
  const ids = ([room.hostId, room.guestId] as string[]).filter(
    (id) => id && !isBotId(id)
  );
  await Promise.all(
    ids.map((id) =>
      rtdb(`records:${id}/${room.kind}`, () =>
        db.ref(`/records/${id}/${room.kind}`).transaction((cur: unknown) => {
        const r = (cur as GameRecord | null) ?? { w: 0, l: 0, d: 0 };
        if (room.winnerId === null) r.d += 1;
        else if (room.winnerId === id) r.w += 1;
        else r.l += 1;
        // Backrooms tracks a high score alongside w/l/d.
        if (room.kind === "backrooms") {
          const s = room.scores?.[id]?.score;
          if (typeof s === "number") r.best = Math.max(r.best ?? 0, s);
        }
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
      // Bot seats never click rematch — a single human ready is enough
      // to start the next round vs the bot. Solo backrooms rooms have no
      // opponent at all — one ready is enough there too.
      const otherIsBot = !!other && isBotId(other);
      // Start a new round when: vs bot (auto-ready) · solo backrooms (no
      // opponent) · or both humans ready (PvP + backrooms duel).
      const startNow =
        otherIsBot ||
        (room.kind === "backrooms" && !other) ||
        (!!other && !!room.rematch[other]);
      if (startNow) {
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
        const fresh = freshBoard(room.kind, room.hostId, room.guestId ?? "");
        room.board =
          room.kind === "tictactoe" || room.kind === "connectfour"
            ? encodeBoard(room.kind, fresh as TTTBoard | C4Board)
            : fresh;
        room.starterId = nextStarter ?? room.hostId;
        room.turn = room.starterId;
        startClockIfChess(room);
        if (room.kind === "backrooms") {
          // Fresh maze every round (same seed for both duelists), scores wiped.
          const seed = randomInt(2 ** 31);
          room.seed = seed;
          room.board = { seed };
          room.scores = {};
        }
        // No synchronous bot move here: if the bot starts the new round,
        // scheduleBotReply() below answers after a human-like delay.
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
  if (done.status === "playing") scheduleBotReply(code, done);
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
  // See playMove: bookkeeping must never delay the response.
  after(() => recordResult(done).catch(() => null));
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
