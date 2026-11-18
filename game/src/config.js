// WINDWARD POST — tuning, palette and layout constants.
// One place for every number the rest of the game reads, so balancing is an edit here.

export const VIEW = { width: 1280, height: 720 };

export const PALETTE = {
  seaDeep: '#0a2c3a',
  seaShallow: '#0f4256',
  // v5: nightfall — day 3 darkens so the lantern glow and gold channel pop.
  seaDeepNight: '#06121f',
  seaShallowNight: '#0a2436',
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
  panel: 'rgba(8, 28, 40, 0.95)', // near-opaque: floater text behind a panel ghosted through at 0.82
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
  // v2: tighter day 1 (quota 4 in 90s, autopilot cleared 10 in 100s in v1),
  // and real escalation — more storms, more rocks, faster wind veer per day.
  { day: 1, quota: 4, seconds: 90, crates: 5, storms: 1, extraRocks: 0, stormSpeed: 26, veer: 0.05 },
  { day: 2, quota: 5, seconds: 100, crates: 6, storms: 3, extraRocks: 2, stormSpeed: 32, veer: 0.08 },
  { day: 3, quota: 6, seconds: 110, crates: 7, storms: 3, extraRocks: 4, stormSpeed: 40, veer: 0.12 },
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
  fragileDelivery: 200,
  chainStep: 25,
  tipNormal: 10,
  tipGold: 30,
  tipFragile: 20,
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
  fragileChance: 0.12,
  respawnDelaySec: 2.5,
};

// v3: channel buoys — the placement layer. Stock is per day; each buoy costs
// tips; buoys near each other link into a channel. Sailing inside the channel
// is faster and calmer (storm damage halved). The button rect is shared by
// render.js (draws it) and main.js (clicks it), so the two can never drift.
export const BUOY = {
  stockPerDay: 3,
  cost: 10, // tips
  linkDist: 300, // px between consecutive buoys to form a channel
  effectRadius: 70, // px from a buoy or channel segment for the bonus
  speedBoost: 1.35,
  stormShelter: 0.5, // storm damage multiplier inside the channel
};

export const BUOY_BTN = { x: 1116, y: 640, w: 150, h: 66 };

// v4: rival mail-boats — the race layer. One rival on day 1, two from day 2.
// Rivals sail the same sea, chase the same crates, and deliver them: first to
// the crate wins it. They run a touch slower than a good player (no gusts,
// no channel of their own), so the day stays winnable by playing well.
// The race strip sits top-centre under the wind panel; its rect is shared by
// render.js and main.js, so the two can never drift.
export const RIVAL = {
  baseSpeed: 118, // px per second at full wind help, before the per-rival factor
  turnRate: 2.2,
  pickupRadius: 30,
  harborRadius: 64,
};

export const RIVAL_DEFS = [
  { id: 'pip', name: 'PIP', color: '#ff5a5a', dark: '#a12727', speed: 0.84 },
  { id: 'juno', name: 'JUNO', color: '#b07cff', dark: '#5b2ea6', speed: 0.78 },
];

export const RACE_STRIP = { x: 490, y: 106, w: 300, h: 34 };

// v5: storm waves + the MAELSTROM boss storm. Each day runs in 3 waves;
// every new wave spawns another storm, faster than the last. On day 3's
// final wave one huge cell wakes and hunts the player's boat. It is
// beatable on purpose: the boat is faster downwind, the buoy channel halves
// its damage, and a gust burst breaks the chase. Survive 20s for +250.
export const WAVES_PER_DAY = 3;

// v6: delivery grade from the chain — the combo grade the HUD shows next
// to CHAIN and in the delivery banner. S/A/B/C from the streak length.
export function gradeFor(chain) {
  if (chain >= 5) return 'S';
  if (chain >= 4) return 'A';
  if (chain >= 3) return 'B';
  if (chain >= 2) return 'C';
  return '—';
}

export const MAELSTROM = {
  radius: 130, // ~1.7x a normal storm cell — big, but escapable
  speed: 60, // a fleeing boat outruns it except dead upwind; ignoring it still gets you caught
  damagePerSec: 8, // ~12s inside to sink at full hull (25s inside the channel)
  surviveSec: 20,
  bonus: 250,
};

export const MAELSTROM_BAR = { x: 475, y: 192, w: 330, h: 40 };

// v7: ROUTE CALL — the per-day lane choice. The card rect is shared by
// render.js (draws the route modal) and main.js (clicks it), so the two can
// never drift — same pattern as BUOY_BTN.
// v8: PIRATE RAID — the second mechanics layer. Named enemy boats that
// hunt the player mid-day (from wave 2): BLACKJACK the CUTTER rams the boat
// and knocks cargo loose; HOOK the SNATCHER steals floating crates and
// flees to the edge. Gust stuns them, route gates shake them off, buoy
// channels slow them. Numbers from Luna's design (v8/luna-design.md).
export const PIRATE = {
  blackjackBase: 157, // px/s before wind help (1.05x the player's cruise)
  hookBase: 135, // 0.9x cruise while hunting crates
  hookFleeBase: 172, // 1.15x cruise while fleeing with a stolen crate
  hookFollowFactor: 0.8, // speed factor when following the player, no crates
  turnRate: 2.4,
  ramRange: 64, // within this, BLACKJACK stops and telegraphs the ram
  ramWindupSec: 0.9,
  ramDamage: 10, // hull points per ram
  ramKnockback: 90, // px BLACKJACK is thrown back after a ram
  maxRamsPerDay: 2,
  ramCooldownSec: 9,
  retreatSec: 6,
  raidDurationSec: 45, // BLACKJACK leaves after this long in the raid
  hookStealRange: 40,
  hookStealSec: 1.4,
  hookEscapeSec: 12, // time to stop HOOK after a theft before the crate is lost
  gustStunSec: 2,
  gustStunRange: 220,
  channelSlow: 0.65, // speed multiplier inside a player buoy channel
  raidRepelScore: 100,
  raidRepelTips: 50,
  crateRecoverScore: 75,
  crateRecoverTips: 25,
};

export const ROUTE_CARD = { x0: 330, y: 300, w: 200, h: 190, gap: 220 };
