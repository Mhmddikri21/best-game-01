// The daily job board: three named contracts per day, each with a short label,
// a progress counter and a score reward. The HUD shows exactly these three, so the
// loop reads as tracked and varied at a glance. main.js calls the on* hooks with
// what just happened; each hook returns the contracts completed by that event.

export const CONTRACT_DEFS = [
  { id: 'rush', name: 'RUSH', desc: 'Deliver 2 crates in the first 45s', reward: 150, target: 2 },
  { id: 'gold', name: 'GOLD RUN', desc: 'Deliver 1 gold ★ crate', reward: 200, target: 1 },
  { id: 'storm', name: 'STORM RUN', desc: 'Ride inside a storm for 2s', reward: 150, target: 2 },
  { id: 'fragile', name: 'FRAGILE', desc: 'Deliver 1 fragile ! crate intact', reward: 200, target: 1 },
  { id: 'chain', name: 'CHAIN x3', desc: 'Deliver 3 crates, no rock hit', reward: 150, target: 3 },
  { id: 'buoys', name: 'CHANNEL', desc: 'Lay 2 buoys in one day', reward: 150, target: 2 },
  // v4: the race contract — lead the best rival by 2 deliveries in the day.
  { id: 'outrace', name: 'OUTRACE', desc: 'Lead the best rival by 2', reward: 200, target: 2 },
];

/** Three distinct contracts for the day, shuffled with the run's rng. */
export function buildContracts(rng) {
  const pool = [...CONTRACT_DEFS];
  const picks = [];
  while (picks.length < 3 && pool.length > 0) {
    picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return picks.map((d) => ({ ...d, progress: 0, done: false }));
}

function finish(state, contract) {
  if (contract.done || contract.progress < contract.target) return null;
  contract.done = true;
  state.contractRewards += contract.reward;
  state.stats.contractsDone += 1;
  return contract;
}

/** How far the player leads the best rival today (never below 0). */
export function raceLead(state) {
  const best = Math.max(0, ...Object.values(state.race.rivals));
  return Math.max(0, state.delivered - best);
}

function refreshOutrace(state, done) {
  for (const c of state.contracts) {
    if (c.done || c.id !== 'outrace') continue;
    c.progress = raceLead(state);
    const f = finish(state, c);
    if (f) done.push(f);
  }
}

/** A delivery just happened. `elapsedSec` is seconds since the day began. */
export function onDelivery(state, crate, elapsedSec) {
  const done = [];
  for (const c of state.contracts) {
    if (c.done) continue;
    if (c.id === 'rush' && elapsedSec <= 45) c.progress += 1;
    if (c.id === 'gold' && crate.gold) c.progress += 1;
    if (c.id === 'fragile' && crate.fragile) c.progress += 1;
    if (c.id === 'chain') c.progress = state.chainStreak;
    const f = finish(state, c);
    if (f) done.push(f);
  }
  refreshOutrace(state, done);
  return done;
}

/** A rival just banked a crate: the OUTRACE lead can shrink. */
export function onRivalDelivery(state) {
  const done = [];
  refreshOutrace(state, done);
  return done;
}

/** The boat spent `dt` seconds inside a storm this step. */
export function onStorm(state, dt) {
  const done = [];
  for (const c of state.contracts) {
    if (c.done || c.id !== 'storm') continue;
    c.progress = Math.min(c.target, c.progress + dt);
    const f = finish(state, c);
    if (f) done.push(f);
  }
  return done;
}

/** A buoy was just laid: the CHANNEL contract tracks placements. */
export function onBuoy(state) {
  const done = [];
  for (const c of state.contracts) {
    if (c.done || c.id !== 'buoys') continue;
    c.progress += 1;
    const f = finish(state, c);
    if (f) done.push(f);
  }
  return done;
}

/** The boat hit a rock: the no-hit chain contract resets. */
export function onRock(state) {
  for (const c of state.contracts) {
    if (c.id === 'chain' && !c.done) c.progress = 0;
  }
  return [];
}

/** Short progress string for the HUD, e.g. "1/2" or "1s/2s". */
export function contractProgress(c) {
  if (c.id === 'storm') return `${Math.min(c.target, Math.floor(c.progress))}s/${c.target}s`;
  return `${Math.min(c.target, c.progress)}/${c.target}`;
}
