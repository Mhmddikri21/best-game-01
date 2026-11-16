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
  // The MAELSTROM is fled the same way — but a rock right ahead always
  // wins, so the boat never flees the boss straight into a rock.
  const storm = nearest(s.sea.storms, b.x, b.y);
  if (storm.item && storm.dist < 150) {
    want = Math.atan2(b.y - storm.item.y, b.x - storm.item.x);
  }
  // v5: flee the MAELSTROM when it closes in — same rule as a storm, but
  // the boss cell is huge, so the keep-out is its radius plus a margin.
  const mael = s.sea.maelstrom;
  if (mael && Math.hypot(b.x - mael.x, b.y - mael.y) < mael.r + 90) {
    want = Math.atan2(b.y - mael.y, b.x - mael.x);
  }
  const rock = nearest(s.sea.rocks, b.x, b.y);
  if (rock.item && rock.dist < rock.item.r + 80) {
    want = Math.atan2(b.y - rock.item.y, b.x - rock.item.x);
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
      // v5: frame WAVE 2/3 — day 2's waves turn at 33s and 67s, so the shot
      // needs at least 40s elapsed before it can stop.
      if (s.daySpec.seconds - s.timeLeft < 40) return false;
      if (s.boat.cargo.length === 0) return false;
      if (s.daySpec.seconds - s.timeLeft < 12) return false;
      const h = harborById(s.sea, s.boat.cargo[0].harbor);
      return Math.hypot(s.boat.x - h.x, s.boat.y - h.y) > 200;
    });
    // Clear transient floaters/particles: a pickup floater drifting behind a
    // HUD panel ghosts through it and reads as clutter (caught by vision).
    game.state.floaters = [];
    game.state.particles = [];
    return;
  }
  if (name === 'maelstrom') {
    // The v5 boss moment: day 3, wave 3, the MAELSTROM hunting the boat
    // down a gold channel, rivals in frame. Staged by jumping the clock to
    // wave 3 (elapsed 74s of 110s) — everything after that plays for real.
    input.press('Enter');
    game.step(STEP, input);
    game.startDay(2);
    game.state.tips = 60;
    runSteps(game, input, 6);
    layChannel(game);
    // Jump the clock to wave 3: the next step spawns the wave-2 and wave-3
    // storms and wakes the Maelstrom. The boat has barely delivered, so the
    // quota cannot end the day before the hunt is framed.
    game.state.timeLeft = game.state.daySpec.seconds - 74;
    runSteps(game, input, 30, (g) => {
      const s = g.state;
      if (s.screen !== 'play') return true;
      const m = s.sea.maelstrom;
      if (!m) return false;
      // Give the day a little more rope if the hunt is not framed yet.
      if (s.timeLeft < 12) s.timeLeft = 25;
      if (m.age < 4) return false;
      if (s.boat.cargo.length === 0) return false;
      return Math.hypot(s.boat.x - m.x, s.boat.y - m.y) < 430;
    });
    // Clear transient floaters/particles so no pickup text ghosts through a
    // HUD panel (same reason as the play scene).
    game.state.floaters = [];
    game.state.particles = [];
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
    // v5: stage all three crates up front, each a short hop from the boat or
    // its harbor, so the three trips finish fast and the rivals stay behind.
    // Crate respawns stay ON (no crateTimer freeze): the rivals steal staged
    // crates, and without respawns the player could never reach 3.
    s.sea.crates = [
      { x: 640, y: 480, harbor: 'rose', gold: false, fragile: false, bob: 0, born: 0 },
      { x: 400, y: 250, harbor: 'amber', gold: false, fragile: false, bob: 0, born: 0 },
      { x: 900, y: 250, harbor: 'teal', gold: false, fragile: false, bob: 0, born: 0 },
    ];
    // Phase 1: win the quota.
    runSteps(game, input, 150, (g) => g.state.delivered >= 3);
    // Phase 2: stop delivering (freeze the count at exactly 3/3), then wait
    // out the MAELSTROM — it wakes at wave 3 (day clock ~73s) and the hunt
    // lasts 20s — fleeing it, so the win screen shows the MAELSTROM bonus
    // line next to the 3/3 count and a race verdict.
    game.state.boat.cargo = [];
    game.state.sea.crates = [];
    game.state.sea.crateTimer = 999;
    for (let i = 0; i < Math.round(60 / STEP) && game.state.screen === 'play' && !game.state.maelstromSurvived; i += 1) {
      const st = game.state;
      const b = st.boat;
      const m = st.sea.maelstrom;
      if (m) {
        // Flee: steer to a point 300px beyond the boat, away from the boss.
        const dx = b.x - m.x;
        const dy = b.y - m.y;
        const d = Math.hypot(dx, dy) || 1;
        steer(game, input, b.x + (dx / d) * 300, b.y + (dy / d) * 300);
      } else {
        // No boss yet: hold near the middle so no storm drifts onto the boat.
        steer(game, input, 640, 360);
      }
      game.step(STEP, input);
    }
    // Lay a couple of buoys with the delivery tips before sunset, so the win
    // screen's buoy count — and the sea behind it — shows the v3 layer too.
    layChannel(game, 2);
    // Freeze the count: no more pickups or deliveries while sunset runs out.
    game.state.boat.cargo = [];
    game.state.sea.crates = [];
    game.state.timeLeft = 0.4;
    runSteps(game, input, 2);
    // Clear transient floaters/particles so the win screen's numbers are the
    // only text in the frame — contract floaters kept cluttering the shot.
    game.state.floaters = [];
    game.state.particles = [];
    return;
  }
  // Default: title — six seconds of the boat sailing behind the title panel.
  // The autopilot sails but never starts the game, so the title stays up.
  runSteps(game, input, 6, null, false);
}
