/** Global tuning constants. Units: meters, seconds. */
export const CFG = {
  world: {
    cell: 4, // meters per grid cell
    mapW: 48,
    mapH: 48,
    wallH: 3.2,
    ceilH: 3.2,
  },
  player: {
    height: 1.6,
    radius: 0.38,
    speedWalk: 4.2,
    speedSprint: 7.2,
    accel: 40,
    friction: 12,
    staminaDrain: 22, // per second sprinting
    staminaRegen: 14, // per second
    staminaMinToSprint: 10,
    maxHealth: 100,
    damageFlashThreshold: 0.95,
  },
  mouse: {
    sensX: 0.0021,
    sensY: 0.0021,
  },
  zombie: {
    baseCount: 8,
    perWave: 4,
    baseSpeed: 1.7,
    speedVar: 0.55,
    speedGrowth: 0.06,
    baseHealth: 100,
    healthGrowth: 0.16,
    damage: 12,
    attackRange: 1.35,
    attackCd: 0.9,
    attackWindup: 0.28,
    separation: 0.55,
    totalWaves: 6,
  zombieTypes: {
      shambler: { health: 100, speed: 1.7, damage: 12, score: 100, color: 0x8a7d55, size: 1.0 },
      runner: { health: 60, speed: 3.4, damage: 8, score: 150, color: 0x6f5b40, size: 0.85 },
      brute: { health: 300, speed: 1.1, damage: 25, score: 300, color: 0x5c5140, size: 1.35 },
    },
  },
  weapon: {
    headshotMult: 2.5,
  },
} as const;

export type ZombieKind = 'shambler' | 'runner' | 'brute';
