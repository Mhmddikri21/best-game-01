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
