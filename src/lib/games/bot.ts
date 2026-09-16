import { randomInt } from "node:crypto";
import { Chess } from "chess.js";
import {
  tttWinner,
  type TTTBoard,
  type TTTMark,
} from "./tictactoe";
import {
  c4Drop,
  c4Winner,
  type C4Board,
  type C4Mark,
} from "./connectfour";
import { isValidGuess, type NumberBoard } from "./number";
import { handValue, type TwentyBoard } from "./twentyone";
import type { ChessBoard } from "./chess";
import type { RPSPick } from "./rps";

export type BotInput = {
  cell?: number;
  col?: number;
  pick?: string;
  guess?: number;
  action?: "hit" | "stand";
  from?: string;
  to?: string;
  promotion?: string;
};

export function isBotId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("bot:");
}

export function botKindOf(id: string): string {
  return id.slice("bot:".length);
}

export function botNameFor(kind: string): string {
  return `Bot · ${kind}`;
}

export function botProfile(kind: string): {
  id: string;
  name: string;
  login42: null;
  avatar: null;
} {
  return {
    id: `bot:${kind}`,
    name: botNameFor(kind),
    login42: null,
    avatar: null,
  };
}

const RPS_PICKS: RPSPick[] = ["rock", "paper", "scissors"];

export function botInputFor(
  kind: string,
  board: unknown,
  botId: string
): BotInput | null {
  switch (kind) {
    case "tictactoe": {
      const b = board as TTTBoard;
      const me = (botId === "host" ? "X" : "O") as TTTMark;
      const opp: TTTMark = me === "X" ? "O" : "X";
      const empties = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !b[i]);
      if (empties.length === 0) return null;
      const findLine = (mark: TTTMark) =>
        empties.find((i) => {
          const probe = b.slice();
          probe[i] = mark;
          return tttWinner(probe);
        });
      const cell =
        findLine(me) ??
        findLine(opp) ??
        [4, 0, 2, 6, 8, 1, 3, 5, 7].find((i) => empties.includes(i)) ??
        empties[0];
      return { cell };
    }
    case "connectfour": {
      const b = board as C4Board;
      const me = (botId === "host" ? "R" : "Y") as C4Mark;
      const opp: C4Mark = me === "R" ? "Y" : "R";
      const drop = (col: number, mark: C4Mark): C4Board | null => {
        const row = c4Drop(b, col);
        if (row < 0) return null;
        const probe = b.map((r) => r.slice());
        probe[row][col] = mark;
        return probe;
      };
      for (const col of [0, 1, 2, 3, 4, 5, 6]) {
        const probe = drop(col, me);
        if (probe && c4Winner(probe)) return { col };
      }
      for (const col of [0, 1, 2, 3, 4, 5, 6]) {
        const probe = drop(col, opp);
        if (probe && c4Winner(probe)) return { col };
      }
      const legal = [0, 1, 2, 3, 4, 5, 6].filter((c) => c4Drop(b, c) >= 0);
      const centerFirst = [3, 2, 4, 1, 5, 0, 6].filter((c) =>
        legal.includes(c)
      );
      const col = centerFirst[0] ?? legal[0];
      return col === undefined ? null : { col };
    }
    case "rps":
      return { pick: RPS_PICKS[randomInt(RPS_PICKS.length)] };
    case "number": {
      const b = board as NumberBoard;
      const below = b.guesses
        .filter((g) => g.n < b.secret)
        .map((g) => g.n);
      const above = b.guesses
        .filter((g) => g.n > b.secret)
        .map((g) => g.n);
      const lo = Math.max(1, ...below, 0) + 1;
      const hi = Math.min(100, ...above, 101) - 1;
      const guess = Math.floor((lo + hi) / 2);
      return isValidGuess(guess) ? { guess } : null;
    }
    case "twentyone": {
      const b = board as TwentyBoard;
      const hand = b.hands[botId] ?? [];
      return handValue(hand) < 17 ? { action: "hit" } : { action: "stand" };
    }
    case "chess": {
      const b = board as ChessBoard;
      let game: Chess;
      try {
        game = new Chess(b.fen);
      } catch {
        return null;
      }
      const moves = game.moves({ verbose: true });
      if (moves.length === 0) return null;
      for (const m of moves) {
        game.move(m);
        const mate = game.isCheckmate();
        game.undo();
        if (mate)
          return {
            from: m.from,
            to: m.to,
            promotion: m.promotion ?? "q",
          };
      }
      const values: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
      let best: (typeof moves)[number] | null = null;
      let bestVal = -1;
      for (const m of moves) {
        if (!m.captured) continue;
        const v = values[m.captured] ?? 0;
        if (v > bestVal) {
          bestVal = v;
          best = m;
        }
      }
      const pick = best ?? moves[randomInt(moves.length)];
      return {
        from: pick.from,
        to: pick.to,
        promotion: pick.promotion ?? "q",
      };
    }
    default:
      return null;
  }
}
