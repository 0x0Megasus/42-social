export type Heat = "exact" | "scorching" | "hot" | "warm" | "cold";

export type NumberGuess = { by: string; n: number; hint: Heat };

export type NumberBoard = {
  secret: number;
  guesses: NumberGuess[];
  tries: Record<string, number>;
};

export function rollSecret(): number {
  return 1 + Math.floor(Math.random() * 100);
}

export function freshNumber(): NumberBoard {
  return { secret: rollSecret(), guesses: [], tries: {} };
}

export function heatFor(secret: number, n: number): Heat {
  const d = Math.abs(secret - n);
  if (d === 0) return "exact";
  if (d <= 3) return "scorching";
  if (d <= 8) return "hot";
  if (d <= 20) return "warm";
  return "cold";
}

export function heatColor(h: Heat): string {
  switch (h) {
    case "exact":
      return "text-emerald-500";
    case "scorching":
      return "text-rose-500";
    case "hot":
      return "text-orange-500";
    case "warm":
      return "text-amber-500";
    default:
      return "text-sky-500";
  }
}

export function isValidGuess(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 100;
}
