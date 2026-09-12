// Pure 21 Duel engine (blackjack-lite). Card values: 2-10, face = 10, ace = 11/1.
export type TwentyBoard = {
  deck: number[];
  hands: Record<string, number[]>;
  stood: Record<string, boolean>;
};

export function shuffledDeck(): number[] {
  const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11];
  const deck: number[] = [];
  for (let s = 0; s < 4; s++) deck.push(...ranks);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function freshTwentyOne(hostId: string, guestId: string): TwentyBoard {
  const deck = shuffledDeck();
  return {
    deck,
    hands: { [hostId]: [deck.pop()!, deck.pop()!], [guestId]: [deck.pop()!, deck.pop()!] },
    stood: {},
  };
}

export function handValue(hand: number[]): number {
  let total = hand.reduce((a, b) => a + b, 0);
  let aces = hand.filter((c) => c === 11).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function cardLabel(v: number): string {
  if (v === 11) return "A";
  if (v === 10) return "10";
  return String(v);
}
