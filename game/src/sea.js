// The sea: islands and harbors, rocks, floating crates and drifting storms.
// Layout is seeded, so the same seed always builds the same archipelago.

import { CRATE, HARBORS, STORM, VIEW } from './config.js';
import { pick, range } from './random.js';

const ROCK_SPOTS = [
  [330, 330], [470, 210], [760, 330], [900, 480], [520, 480],
  [180, 470], [1080, 330], [640, 240], [830, 610], [380, 610],
];

export function createSea(rng, daySpec) {
  const sea = {
    harbors: HARBORS.map((h) => ({ ...h, pulse: 0 })),
    rocks: ROCK_SPOTS.map(([x, y], i) => ({
      x: x + range(rng, -26, 26),
      y: y + range(rng, -26, 26),
      r: range(rng, 18, 30),
      seed: i * 1.7 + 0.4,
    })),
    crates: [],
    storms: [],
    crateTimer: 0,
  };
  for (let i = 0; i < daySpec.storms; i += 1) {
    sea.storms.push({
      x: range(rng, 300, VIEW.width - 300),
      y: range(rng, 180, VIEW.height - 180),
      angle: range(rng, 0, Math.PI * 2),
      flicker: rng(),
    });
  }
  for (let i = 0; i < daySpec.crates; i += 1) spawnCrate(sea, rng);
  return sea;
}

function freeWater(rng, sea, margin) {
  for (let tries = 0; tries < 40; tries += 1) {
    const x = range(rng, margin, VIEW.width - margin);
    const y = range(rng, margin, VIEW.height - margin);
    let ok = true;
    for (const h of sea.harbors) if (Math.hypot(x - h.x, y - h.y) < 150) ok = false;
    for (const r of sea.rocks) if (Math.hypot(x - r.x, y - r.y) < r.r + 60) ok = false;
    if (ok) return { x, y };
  }
  return { x: VIEW.width / 2, y: VIEW.height / 2 };
}

export function spawnCrate(sea, rng, near) {
  const spot = near ?? freeWater(rng, sea, 90);
  const gold = rng() < CRATE.goldChance;
  sea.crates.push({
    x: spot.x,
    y: spot.y,
    harbor: gold ? pick(rng, HARBORS).id : pick(rng, HARBORS).id,
    gold,
    bob: range(rng, 0, Math.PI * 2),
    born: 0,
  });
}

export function stepSea(sea, dt, rng, daySpec) {
  for (const h of sea.harbors) h.pulse = Math.max(0, h.pulse - dt * 1.4);
  for (const c of sea.crates) {
    c.bob += dt * 2.2;
    c.born += dt;
  }
  for (const s of sea.storms) {
    s.x += Math.cos(s.angle) * STORM.driftSpeed * dt;
    s.y += Math.sin(s.angle) * STORM.driftSpeed * dt;
    s.flicker = Math.max(0, s.flicker - dt * 2);
    if (rng() < dt * 0.25) s.flicker = 1;
    if (s.x < 120 || s.x > VIEW.width - 120) s.angle = Math.PI - s.angle;
    if (s.y < 100 || s.y > VIEW.height - 100) s.angle = -s.angle;
  }
  sea.crateTimer -= dt;
  if (sea.crates.length < daySpec.crates && sea.crateTimer <= 0) {
    sea.crateTimer = CRATE.respawnDelaySec;
    spawnCrate(sea, rng);
  }
}

export function harborById(sea, id) {
  return sea.harbors.find((h) => h.id === id);
}
