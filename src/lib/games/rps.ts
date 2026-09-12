// Pure Rock-Paper-Scissors engine (best of 5, first to 3).
export type RPSPick = "rock" | "paper" | "scissors";

export type RPSRound = {
  a: RPSPick;
  b: RPSPick;
  winner: string | null; // userId or null = draw
};

export type RPSBoard = {
  picks: Record<string, RPSPick>; // userId -> this round's secret pick
  rounds: RPSRound[];
  score: Record<string, number>;
  target: number;
};

export const RPS_TARGET = 3;

export function isRPSPick(v: unknown): v is RPSPick {
  return v === "rock" || v === "paper" || v === "scissors";
}

export function freshRPS(): RPSBoard {
  return { picks: {}, rounds: [], score: {}, target: RPS_TARGET };
}

// 0 = draw, 1 = a wins, 2 = b wins
export function rpsResolve(a: RPSPick, b: RPSPick): 0 | 1 | 2 {
  if (a === b) return 0;
  if (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  )
    return 1;
  return 2;
}

export function rpsEmoji(p: RPSPick): string {
  return p === "rock" ? "✊" : p === "paper" ? "✋" : "✌️";
}
