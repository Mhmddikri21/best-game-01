// Channel buoys: the v3 placement layer. The player lays glowing buoys on the
// water (B or the BUOY button, then click); buoys near each other link into a
// channel, and sailing inside the channel is faster and calmer. Buoys cost tips
// and are limited per day, so where you lay them — and whether you lay them at
// all — is a real routing decision, tracked by the CHANNEL contract.
// buoys.js owns the rules; main.js owns the input; render.js draws them.

import { BUOY, VIEW } from './config.js';
import { clamp } from './random.js';
import { onBuoy } from './contracts.js';

export function createBuoyState() {
  return { list: [] };
}

/** Consecutive buoys within link distance form the channel. Returns index pairs. */
export function channelSegments(buoys) {
  const segs = [];
  for (let i = 1; i < buoys.list.length; i += 1) {
    const a = buoys.list[i - 1];
    const b = buoys.list[i];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= BUOY.linkDist) segs.push([a, b]);
  }
  return segs;
}

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** True while the point sails inside a buoy's calm ring or a channel segment. */
export function inChannel(buoys, x, y) {
  if (!buoys) return false;
  for (const b of buoys.list) {
    if (Math.hypot(x - b.x, y - b.y) <= BUOY.effectRadius) return true;
  }
  for (const [a, b] of channelSegments(buoys)) {
    if (distToSegment(x, y, a, b) <= BUOY.effectRadius) return true;
  }
  return false;
}

/** Why a buoy cannot go here, or null when the spot is open water. */
export function placementProblem(state, x, y) {
  const s = state;
  if (s.buoyStock <= 0) return 'NO BUOYS LEFT TODAY';
  if (s.tips < BUOY.cost) return `NEED ${BUOY.cost}c TIPS TO LAY A BUOY`;
  if (x < 60 || x > VIEW.width - 60 || y < 60 || y > VIEW.height - 60) return 'TOO CLOSE TO THE EDGE';
  for (const h of s.sea.harbors) {
    if (Math.hypot(x - h.x, y - h.y) < 130) return 'TOO CLOSE TO SHORE';
  }
  for (const r of s.sea.rocks) {
    if (Math.hypot(x - r.x, y - r.y) < r.r + 24) return 'TOO CLOSE TO A ROCK';
  }
  for (const b of s.sea.buoys.list) {
    if (Math.hypot(x - b.x, y - b.y) < 46) return 'TOO CLOSE TO A BUOY';
  }
  return null;
}

/**
 * Lay a buoy at (x, y). Returns { ok, reason, done } where done lists any
 * contracts completed by the placement. Shared by the click path and the
 * screenshot staging, so a staged buoy is a real buoy.
 */
export function placeBuoy(state, x, y) {
  const problem = placementProblem(state, x, y);
  if (problem) return { ok: false, reason: problem, done: [] };
  state.tips -= BUOY.cost;
  state.buoyStock -= 1;
  state.stats.buoysPlaced += 1;
  state.sea.buoys.list.push({ x: Math.round(x), y: Math.round(y), seed: state.time });
  const done = onBuoy(state);
  return { ok: true, reason: '', done };
}
