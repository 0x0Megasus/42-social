import { describe, expect, it } from "vitest";
import {
  decideBackroomsWinner,
  sanitizeRunResult,
} from "../games-store";
import type { RunResult } from "../games/types";

const HOST = "u_host";
const GUEST = "u_guest";

const run = (over: Partial<RunResult> = {}): RunResult => ({
  score: 1000,
  kills: 10,
  wave: 3,
  time: 120,
  won: false,
  ...over,
});

describe("decideBackroomsWinner", () => {
  it("solo: host wins by submitting", () => {
    expect(decideBackroomsWinner(HOST, null, { [HOST]: run() })).toBe(HOST);
  });

  it("no host score: no winner", () => {
    expect(decideBackroomsWinner(HOST, GUEST, {})).toBeNull();
  });

  it("higher score wins", () => {
    expect(
      decideBackroomsWinner(HOST, GUEST, {
        [HOST]: run({ score: 5000 }),
        [GUEST]: run({ score: 4999 }),
      })
    ).toBe(HOST);
    expect(
      decideBackroomsWinner(HOST, GUEST, {
        [HOST]: run({ score: 1 }),
        [GUEST]: run({ score: 9000 }),
      })
    ).toBe(GUEST);
  });

  it("score tie breaks on faster time", () => {
    expect(
      decideBackroomsWinner(HOST, GUEST, {
        [HOST]: run({ score: 3000, time: 200 }),
        [GUEST]: run({ score: 3000, time: 199 }),
      })
    ).toBe(GUEST);
  });

  it("exact tie is a draw", () => {
    expect(
      decideBackroomsWinner(HOST, GUEST, {
        [HOST]: run(),
        [GUEST]: run(),
      })
    ).toBeNull();
  });
});

describe("sanitizeRunResult", () => {
  it("accepts a valid run and floors fractional numbers", () => {
    expect(
      sanitizeRunResult({ score: 1234.9, kills: 12, wave: 4, time: 98.5, won: true })
    ).toEqual({ score: 1234, kills: 12, wave: 4, time: 98.5, won: true });
  });

  it("rejects garbage", () => {
    expect(sanitizeRunResult(null)).toBeNull();
    expect(sanitizeRunResult({})).toBeNull();
    expect(sanitizeRunResult({ score: -5, kills: 1, wave: 1, time: 1, won: false })).toBeNull();
    expect(sanitizeRunResult({ score: 1e12, kills: 1, wave: 1, time: 1, won: false })).toBeNull();
    expect(sanitizeRunResult({ score: 10, kills: 1, wave: 9, time: 1, won: false })).toBeNull();
    expect(sanitizeRunResult({ score: 10, kills: 1, wave: 1, time: 1, won: "yes" })).toBeNull();
    expect(sanitizeRunResult({ score: NaN, kills: 1, wave: 1, time: 1, won: false })).toBeNull();
  });
});
