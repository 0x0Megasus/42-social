import { describe, expect, it } from "vitest";
import {
  previewC4Move,
  previewChessMove,
  previewTttMove,
  previewTwentyOneStand,
} from "../games/optimistic";
import { freshTTT } from "../games/tictactoe";
import { freshC4 } from "../games/connectfour";
import { CHESS_STARTPOS, freshChess } from "../games/chess";

describe("previewTttMove", () => {
  it("applies a legal move", () => {
    const r = previewTttMove(freshTTT(), 4, "X");
    expect(r).toEqual({ ok: true, board: expect.any(Array) });
    if (r.ok) expect(r.board[4]).toBe("X");
  });

  it("rejects an occupied cell without hitting the network", () => {
    const b = freshTTT();
    b[0] = "O";
    expect(previewTttMove(b, 0, "X")).toEqual({ ok: false, reason: "illegal" });
  });

  it("rejects out-of-range cells", () => {
    expect(previewTttMove(freshTTT(), 9, "X")).toEqual({
      ok: false,
      reason: "illegal",
    });
  });
});

describe("previewC4Move", () => {
  it("drops to the bottom row first", () => {
    const r = previewC4Move(freshC4(), 3, "R");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.board[5][3]).toBe("R");
  });

  it("stacks discs", () => {
    let b = freshC4();
    const first = previewC4Move(b, 3, "R");
    expect(first.ok).toBe(true);
    if (first.ok) b = first.board;
    const second = previewC4Move(b, 3, "Y");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.board[4][3]).toBe("Y");
  });

  it("rejects an out-of-range column", () => {
    expect(previewC4Move(freshC4(), 7, "R")).toEqual({
      ok: false,
      reason: "illegal",
    });
  });
});

describe("previewChessMove", () => {
  it("applies a legal opening move and appends SAN", () => {
    const r = previewChessMove(freshChess(), "e2", "e4");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.board.history[r.board.history.length - 1]).toBe("e4");
      expect(r.board.fen.startsWith("rnbqkbnr/pppppppp/8/8/4P3")).toBe(true);
    }
  });

  it("rejects an illegal move", () => {
    expect(previewChessMove(freshChess(), "e2", "e5")).toEqual({
      ok: false,
      reason: "illegal",
    });
  });

  it("defaults promotion to queen, matching the server", () => {
    // Pawn on a7, black king out of the way, white to move.
    const fen = "7k/P7/8/8/8/8/8/K7 w - - 0 1";
    const r = previewChessMove({ fen, history: [] }, "a7", "a8");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.board.history[0].startsWith("a8=Q")).toBe(true);
  });

  it("rejects a corrupt FEN", () => {
    expect(previewChessMove({ fen: "not-a-fen", history: [] }, "e2", "e4")).toEqual({
      ok: false,
      reason: "illegal",
    });
  });

  it("start FEN constant is intact", () => {
    expect(CHESS_STARTPOS.split(" ").length).toBe(6);
  });
});

describe("previewTwentyOneStand", () => {
  it("marks the player stood without touching hands", () => {
    const hands = { a: [10, 11], b: [5] };
    const out = previewTwentyOneStand(hands, { b: true }, "a");
    expect(out.stood).toEqual({ a: true, b: true });
    expect(hands).toEqual({ a: [10, 11], b: [5] });
  });
});
