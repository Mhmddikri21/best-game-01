// WINDWARD POST — tuning, palette and layout constants.
// One place for every number the rest of the game reads, so balancing is an edit here.

export const VIEW = { width: 1280, height: 720 };

export const PALETTE = {
  seaDeep: '#0a2c3a',
  seaShallow: '#0f4256',
  seaFoam: '#bfe8dd',
  sand: '#d9b380',
  sandDark: '#b98f5e',
  rock: '#5d6b73',
  rockDark: '#42505a',
  wood: '#8a5a33',
  woodDark: '#5f3d22',
  sail: '#f7f1de',
  sailShade: '#e3d5ae',
  ink: '#10222e',
  panel: 'rgba(8, 28, 40, 0.82)',
  panelLine: 'rgba(191, 232, 221, 0.35)',
  cream: '#f7f1de',
  gold: '#ffc857',
  danger: '#ff6b5e',
  ok: '#7be0a3',
};

export const HARBORS = [
  { id: 'amber', letter: 'A', name: 'AMBER QUAY', color: '#ffb347', dark: '#c47f1a', x: 210, y: 150 },
  { id: 'teal', letter: 'T', name: 'TEAL PIER', color: '#3fd2c0', dark: '#1e8f83', x: 1075, y: 150 },
  { id: 'rose', letter: 'R', name: 'ROSE DOCK', color: '#ff7d9c', dark: '#c24a68', x: 640, y: 585 },
];

export const DAYS = [
  { day: 1, quota: 3, seconds: 100, crates: 4, storms: 1 },
  { day: 2, quota: 4, seconds: 110, crates: 5, storms: 2 },
  { day: 3, quota: 5, seconds: 120, crates: 6, storms: 2 },
];

export const BOAT = {
  radius: 16,
  turnRate: 2.6, // radians per second
  baseSpeed: 150, // px per second at full sail, beam wind
  downwindBonus: 1.55,
  upwindPenalty: 0.38,
  accel: 260,
  drag: 0.9,
  hull: 100,
  rockDamage: 18,
  stormDamagePerSec: 12,
  pickupRadius: 30,
  harborRadius: 64,
  carryBase: 2,
};

export const GUST = {
  max: 100,
  cost: 35,
  regenPerSec: 6,
  impulse: 240,
  duration: 0.9,
};

export const SCORE = {
  delivery: 100,
  goldDelivery: 300,
  chainStep: 25,
  tipNormal: 10,
  tipGold: 30,
  dayBonus: 250,
};

export const WIND = {
  turnPerSec: 0.05, // radians per second of slow veer
  gustEverySec: 7,
  gustLifeSec: 3.2,
};

export const CURRENT = {
  speed: 22, // px per second of drift
  turnPerSec: 0.02,
};

export const STORM = {
  radius: 78,
  driftSpeed: 26,
};

export const CRATE = {
  goldChance: 0.18,
  respawnDelaySec: 2.5,
};
