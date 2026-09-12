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

function freshBoard(kind: GameKind): TTTBoard | C4Board {
  return kind === "tictactoe" ? freshTTT() : freshC4();
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

function decodeBoard(kind: GameKind, raw: unknown): TTTBoard | C4Board {
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

// RTDB drops empty/nullish nodes (all-null boards, {} rematch, null winner).
// Restore them on every read so engines never see undefined.
function normalizeRoom(room: GameRoom): GameRoom {
  room.board = decodeBoard(room.kind, room.board);
  room.rematch ??= {};
  room.winLine ??= null;
  room.winnerId ??= null;
  room.guestId ??= null;
  return room;
}

export function markFor(room: GameRoom, userId: string): TTTMark | C4Mark | null {
  if (userId === room.hostId) return room.kind === "tictactoe" ? "X" : "R";
  if (userId === room.guestId) return room.kind === "tictactoe" ? "O" : "Y";
  return null;
}

function toView(room: GameRoom, meId: string): GameView {
  const mark = markFor(room, meId);
  const opponentId =
    meId === room.hostId ? room.guestId : meId === room.guestId ? room.hostId : null;
  return {
    ...room,
    myMark: mark,
    yourTurn: !!mark && room.status === "playing" && room.turn === meId,
    opponentId,
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
    const room: GameRoom = {
      id,
      kind,
      hostId,
      guestId: null,
      board: encodeBoard(kind, freshBoard(kind)),
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

export type MoveInput = { cell?: number; col?: number };

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
      if (room.status !== "playing" || room.turn !== meId) return;
      const mark = markFor(room, meId);
      if (!mark) return;
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
      } else {
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
      }
      // records resolved at game end, atomically with the result
      room.updatedAt = new Date().toISOString();
      // re-encode: RTDB strips nulls inside arrays
      room.board = encodeBoard(
        room.kind,
        room.board as TTTBoard | C4Board
      );
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
        // both ready — new round, starter alternates for fairness
        const nextStarter =
          room.starterId === room.hostId ? room.guestId : room.hostId;
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
