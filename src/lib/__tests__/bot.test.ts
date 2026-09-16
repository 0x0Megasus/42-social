import { describe, expect, it } from "vitest";
import { tickChessClock, CHESS_CLOCK_START_MS, type ChessBoard } from "../games/chess";
import { botInputFor } from "../games/bot";
import { freshTTT } from "../games/tictactoe";
import { freshC4 } from "../games/connectfour";
import { freshChess } from "../games/chess";
import { freshTwentyOne } from "../games/twentyone";

const HOST = "u_host";
const GUEST = "bot:chess";

describe("tickChessClock", () => {
  it("initializes both clocks without charging anyone", () => {
    const c = tickChessClock(null, 1000, true);
    expect(c.w).toBe(CHESS_CLOCK_START_MS);
    expect(c.b).toBe(CHESS_CLOCK_START_MS);
    expect(c.msAt).toBe(1000);
  });

  it("charges only the side to move", () => {
    const c0 = tickChessClock(null, 0, true);
    const c1 = tickChessClock(c0, 5000, true); // white thinks 5s
    expect(c1.w).toBe(CHESS_CLOCK_START_MS - 5000);
    expect(c1.b).toBe(CHESS_CLOCK_START_MS);
    const c2 = tickChessClock(c1, 9000, false); // black thinks 4s
    expect(c2.w).toBe(CHESS_CLOCK_START_MS - 5000);
    expect(c2.b).toBe(CHESS_CLOCK_START_MS - 4000);
  });

  it("clamps at zero", () => {
    const c0 = tickChessClock(null, 0, true);
    const c1 = tickChessClock(c0, CHESS_CLOCK_START_MS + 999_999, true);
    expect(c1.w).toBe(0);
    expect(c1.b).toBeGreaterThan(0);
  });
});

describe("bot: tictactoe", () => {
  it("takes an immediate win", () => {
    const b = freshTTT();
    b[0] = "O"; // bot
    b[3] = "X";
    b[4] = "O";
    b[7] = "X";
    b[2] = "X";
    const mv = botInputFor("tictactoe", b, GUEST) as { cell: number };
    expect(mv.cell).toBe(8);
  });

  it("blocks an immediate human win", () => {
    const b = freshTTT();
    b[0] = "X";
    b[1] = "X";
    b[4] = "O";
    const mv = botInputFor("tictactoe", b, GUEST) as { cell: number };
    expect(mv.cell).toBe(2);
  });

  it("prefers center when nothing urgent", () => {
    const mv = botInputFor("tictactoe", freshTTT(), GUEST) as { cell: number };
    expect(mv.cell).toBe(4);
  });
});

describe("bot: connectfour", () => {
  it("wins when a winning column exists", () => {
    const b = freshC4();
    const drop = (mark: "R" | "Y", col: number) => {
      for (let r = 5; r >= 0; r--) {
        if (!b[r][col]) {
          b[r][col] = mark;
          return;
        }
      }
    };
    drop("Y", 0);
    drop("R", 0);
    drop("Y", 1);
    drop("R", 1);
    drop("Y", 2);
    drop("R", 2);
    const mv = botInputFor("connectfour", b, GUEST) as { col: number };
    expect(mv.col).toBe(3);
  });

  it("blocks a human three-in-a-row", () => {
    const b = freshC4();
    const drop = (mark: "R" | "Y", col: number) => {
      for (let r = 5; r >= 0; r--) {
        if (!b[r][col]) {
          b[r][col] = mark;
          return;
        }
      }
    };
    drop("R", 0);
    drop("Y", 0);
    drop("R", 1);
    drop("Y", 1);
    drop("R", 2);
    drop("Y", 5); // bot filler, does not affect row 5 cols 0-3
    const mv = botInputFor("connectfour", b, GUEST) as { col: 3 } | { col: number };
    expect(mv.col).toBe(3);
  });
});

describe("bot: chess", () => {
  it("delivers mate in one", () => {
    const fen = "6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1";
    const mv = botInputFor("chess", { fen, history: [] }, "bot:chess") as {
      from: string;
      to: string;
    };
    expect(mv.from).toBe("d1");
    expect(mv.to).toBe("d8");
  });

  it("takes the hanging queen (only capture available)", () => {
    const fen = "rnb1kbnr/pppppppp/8/3q4/8/3Q4/PPPP1PPP/RNB1KBNR w - - 0 1";
    const mv = botInputFor("chess", { fen, history: [] }, "bot:chess") as {
      from: string;
      to: string;
    };
    expect(mv.from).toBe("d3");
    expect(mv.to).toBe("d5");
  });

  it("returns a legal move for fresh games", () => {
    const g = freshChess();
    const mv = botInputFor("chess", g, "bot:chess");
    expect(mv).not.toBeNull();
  });
});

describe("bot: twentyone", () => {
  it("hits below 17 and stands at 17+", () => {
    const b = freshTwentyOne(HOST, GUEST);
    b.hands[GUEST] = [10, 5]; // 15 -> hit
    expect(botInputFor("twentyone", b, GUEST)).toEqual({ action: "hit" });
    b.hands[GUEST] = [10, 7]; // 17 -> stand
    expect(botInputFor("twentyone", b, GUEST)).toEqual({ action: "stand" });
  });
});

describe("bot: rps + number", () => {
  it("picks a valid rps move", () => {
    const mv = botInputFor("rps", { picks: {}, rounds: [], score: {}, target: 3 }, GUEST) as {
      pick: string;
    };
    expect(["rock", "paper", "scissors"]).toContain(mv.pick);
  });

  it("binary-searches toward the secret", () => {
    const b = {
      secret: 73,
      guesses: [
        { by: HOST, n: 50, hint: "cold" as const },
        { by: HOST, n: 87, hint: "hot" as const },
      ],
      tries: { [HOST]: 2 },
    };
    const mv = botInputFor("number", b, GUEST) as { guess: number };
    expect(mv.guess).toBe(68);
  });

  it("board type keeps optional clock shape", () => {
    const b: ChessBoard = { fen: "x", history: [], clock: null };
    expect(b.clock).toBeNull();
  });
});
