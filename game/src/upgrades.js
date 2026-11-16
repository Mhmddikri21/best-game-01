// Between-day upgrades: pick 1 of 3. Each is one clear effect the HUD can show,
// and each changes how the next day plays.

export const UPGRADES = [
  {
    id: 'sail', name: 'BIG SAIL', desc: '+18% top speed', icon: '▲',
    apply: (u) => { u.speedMod = (u.speedMod ?? 1) * 1.18; },
  },
  {
    id: 'hull', name: 'IRON RIBS', desc: '+40 max hull, patch 40', icon: '▣',
    apply: (u, boat) => {
      u.maxHull = (u.maxHull ?? 100) + 40;
      if (boat) { boat.maxHull = u.maxHull; boat.hull = Math.min(boat.maxHull, boat.hull + 40); }
    },
  },
  {
    id: 'rudder', name: 'SWIFT RUDDER', desc: '+30% turning', icon: '↻',
    apply: (u) => { u.turnMod = (u.turnMod ?? 1) * 1.3; },
  },
  {
    id: 'net', name: 'CARGO NET', desc: 'Carry +1 crate', icon: '▤',
    apply: (u, boat) => {
      u.carryMax = (u.carryMax ?? 2) + 1;
      if (boat) boat.carryMax = u.carryMax;
    },
  },
  {
    id: 'tank', name: 'GUST TANK', desc: '+50 gust meter', icon: '≋',
    apply: (u, boat) => {
      u.gustMax = (u.gustMax ?? 100) + 50;
      if (boat) { boat.gust = u.gustMax; }
    },
  },
  {
    id: 'canvas', name: 'STORM CANVAS', desc: 'Storm damage halved', icon: '☂',
    apply: (u) => { u.stormShield = true; },
  },
];

/** Three distinct upgrades the player does not own yet (or repeats if the pool runs out). */
export function offerUpgrades(ownedIds, rng) {
  const fresh = UPGRADES.filter((u) => !ownedIds.includes(u.id));
  const pool = fresh.length >= 3 ? fresh : UPGRADES;
  const picks = [];
  const copy = [...pool];
  while (picks.length < 3 && copy.length > 0) {
    picks.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return picks;
}
