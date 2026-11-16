// Screenshot scenes behind ?shot=title|play|action|end.
// Each one plays the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (seek the nearest crate, then its harbor; keep clear of
// rocks and storms; burst on a straight run), so every frame is what a short game really
// looks like and the same seed always gives the same frame.

import { BOAT } from './config.js';
import { angleDiff, clamp } from './random.js';
import { harborById } from './sea.js';

const STEP = 1 / 60;

function makeVirtualInput() {
  const pressed = new Set();
  const v = {
    left: false,
    right: false,
    sailUp: false,
    sailDown: false,
    waypoint: null,
    mouse: { x: 0, y: 0 },
    press(code) { pressed.add(code); },
    wasPressed(code) { return pressed.has(code); },
    endStep() { pressed.clear(); v.left = false; v.right = false; v.sailUp = false; v.sailDown = false; },
    clearWaypoint() { v.waypoint = null; },
  };
  return v;
}

function nearest(list, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const item of list) {
    const d = Math.hypot(item.x - x, item.y - y);
    if (d < bestD) { bestD = d; best = item; }
  }
  return { item: best, dist: bestD };
}

/** Steer the boat toward `tx, ty`, keeping clear of rocks and storms. */
function steer(game, input, tx, ty) {
  const s = game.state;
  const b = s.boat;
  let want = Math.atan2(ty - b.y, tx - b.x);
  // Keep clear: a close rock or storm overrides the heading with the way out.
  const rock = nearest(s.sea.rocks, b.x, b.y);
  if (rock.item && rock.dist < rock.item.r + 80) {
    want = Math.atan2(b.y - rock.item.y, b.x - rock.item.x);
  }
  const storm = nearest(s.sea.storms, b.x, b.y);
  if (storm.item && storm.dist < 150) {
    want = Math.atan2(b.y - storm.item.y, b.x - storm.item.x);
  }
  const diff = angleDiff(b.heading, want);
  input.left = diff < -0.08;
  input.right = diff > 0.08;
  input.sailUp = true;
  const dist = Math.hypot(tx - b.x, ty - b.y);
  if (Math.abs(diff) < 0.25 && dist > 350 && b.gust >= 35 && b.gustTime <= 0) input.press('Space');
  return dist;
}

function autopilot(game, input, allowStart = true) {
  const s = game.state;
  if (s.screen === 'title') { if (allowStart) input.press('Enter'); return; }
  if (s.screen !== 'play') return;
  const b = s.boat;
  if (b.cargo.length < b.carryMax && s.sea.crates.length > 0) {
    const { item } = nearest(s.sea.crates, b.x, b.y);
    steer(game, input, item.x, item.y);
  } else if (b.cargo.length > 0) {
    const h = harborById(s.sea, b.cargo[0].harbor);
    steer(game, input, h.x, h.y);
  }
}

function runSteps(game, input, seconds, until, allowStart = true) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    autopilot(game, input, allowStart);
    game.step(STEP, input);
    if (until && until(game)) break;
  }
}

/** Lay up to `n` buoys from the boat toward its current target (crate or
 * harbor), spaced to link into a channel. Uses the real placement path, so a
 * staged channel is a real channel. Spots that fail validation are nudged. */
function layChannel(game, n = 3) {
  const s = game.state;
  const b = s.boat;
  const target = b.cargo.length > 0
    ? harborById(s.sea, b.cargo[0].harbor)
    : (s.sea.crates[0] ?? { x: 640, y: 360 });
  const a = Math.atan2(target.y - b.y, target.x - b.x);
  for (let i = 0; i < n; i += 1) {
    const dist = 90 + i * 190;
    let placed = false;
    for (const [dx, dy] of [[0, 0], [0, -70], [0, 70], [-70, 0], [70, 0], [0, -140], [0, 140]]) {
      const x = clamp(b.x + Math.cos(a) * dist + dx, 60, 1220);
      const y = clamp(b.y + Math.sin(a) * dist + dy, 60, 660);
      if (game.placeBuoy(x, y).ok) { placed = true; break; }
    }
    if (!placed) break;
  }
}

export function stageShot(name, game) {
  const input = makeVirtualInput();
  game.resetRun();
  if (name === 'play') {
    // Day 2, mid-run: three storms, extra rocks, contracts ticking, boat carrying
    // — and a buoy channel laid along its route, so the v3 layer reads in play.
    input.press('Enter');
    game.step(STEP, input);
    game.startDay(1);
    game.state.tips = 60;
    runSteps(game, input, 6);
    layChannel(game);
    runSteps(game, input, 45, (g) => {
      const s = g.state;
      if (s.screen !== 'play') return true;
      if (s.boat.cargo.length === 0) return false;
      if (s.daySpec.seconds - s.timeLeft < 12) return false;
      const h = harborById(s.sea, s.boat.cargo[0].harbor);
      return Math.hypot(s.boat.x - h.x, s.boat.y - h.y) > 200;
    });
    return;
  }
  if (name === 'place') {
    // The v3 decision moment: two buoys already linked into a channel, the
    // boat carrying a crate mid-route, place mode ON with the ghost extending
    // the channel toward the next leg. Everything staged is real game state.
    input.press('Enter');
    game.step(STEP, input);
    game.startDay(1);
    game.state.tips = 60;
    runSteps(game, input, 6);
    layChannel(game, 2);
    runSteps(game, input, 30, (g) => {
      const s2 = g.state;
      if (s2.screen !== 'play') return true;
      if (s2.boat.cargo.length === 0) return false;
      if (s2.daySpec.seconds - s2.timeLeft < 12) return false;
      const h2 = harborById(s2.sea, s2.boat.cargo[0].harbor);
      return Math.hypot(s2.boat.x - h2.x, s2.boat.y - h2.y) > 200;
    });
    const s3 = game.state;
    if (s3.screen === 'play') {
      const target = s3.boat.cargo.length > 0
        ? harborById(s3.sea, s3.boat.cargo[0].harbor)
        : { x: 640, y: 360 };
      const last = s3.sea.buoys.list[s3.sea.buoys.list.length - 1] ?? { x: s3.boat.x, y: s3.boat.y };
      const a = Math.atan2(target.y - last.y, target.x - last.x);
      const ghost = {
        x: clamp(last.x + Math.cos(a) * 190, 60, 1220),
        y: clamp(last.y + Math.sin(a) * 190, 60, 660),
      };
      s3.placeBuoy = true;
      s3.placeGhost = ghost;
      input.mouse = { ...ghost };
    }
    return;
  }
  if (name === 'upgrade') {
    // Play day 1 for real until it clears: the upgrade pick is a real screen.
    input.press('Enter');
    game.step(STEP, input);
    runSteps(game, input, 200, (g) => g.state.screen === 'dayclear');
    return;
  }
  if (name === 'end') {
    // Day 3 with a three-crate quota, carry-one-at-a-time: the autopilot really
    // wins the day, and the win screen's numbers match the quota exactly.
    input.press('Enter');
    game.step(STEP, input);
    game.startDay(2);
    const s = game.state;
    s.daySpec = { ...s.daySpec, quota: 3 };
    s.boat.carryMax = 1;
    s.timeLeft = 110;
    s.sea.crates = [{
      x: clamp(s.boat.x + 90, 60, 1220),
      y: clamp(s.boat.y - 40, 60, 660),
      harbor: 'amber',
      gold: false,
      fragile: false,
      bob: 0,
      born: 0,
    }];
    runSteps(game, input, 150, (g) => g.state.delivered >= 3);
    // Lay a couple of buoys with the delivery tips before sunset, so the win
    // screen's buoy count — and the sea behind it — shows the v3 layer too.
    layChannel(game, 2);
    // Freeze the count: no more pickups or deliveries while sunset runs out.
    game.state.boat.cargo = [];
    game.state.sea.crates = [];
    game.state.timeLeft = 0.4;
    runSteps(game, input, 2);
    return;
  }
  // Default: title — six seconds of the boat sailing behind the title panel.
  // The autopilot sails but never starts the game, so the title stays up.
  runSteps(game, input, 6, null, false);
}
