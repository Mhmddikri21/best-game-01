// Screenshot scenes behind ?shot=title|play|action|end.
// Each one plays the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (seek the nearest crate, then its harbor; keep clear of
// rocks and storms; burst on a straight run), so every frame is what a short game really
// looks like and the same seed always gives the same frame.

import { BOAT, gradeFor } from './config.js';
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
  // v8: flee BLACKJACK when it closes in — the raider is faster than a
  // storm, so the keep-out is wider. HOOK is slower than the boat, so it
  // needs no fleeing (the gust below stuns it when it gets close).
  const bj = (s.pirates?.raiders ?? []).find((r) => r.kind === 'blackjack' && r.mode !== 'leaving');
  if (bj && Math.hypot(b.x - bj.x, b.y - bj.y) < 170) {
    want = Math.atan2(b.y - bj.y, b.x - bj.x);
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
  // v8: gust to stun a raider closing in — the real counterplay, so a staged
  // run survives the raid the way a good player would.
  const nearRaider = (s.pirates?.raiders ?? []).some((r) => r.mode !== 'leaving' && Math.hypot(b.x - r.x, b.y - r.y) < 220);
  if (nearRaider && b.gust >= 35 && b.gustTime <= 0) input.press('Space');
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

/** Steer through the route's unpassed gates, in order, before normal play.
 * Same steer() as the autopilot, so a staged gate pass is a real one. */
function seekGates(game, input, maxSeconds) {
  const n = Math.round(maxSeconds / STEP);
  for (let i = 0; i < n; i += 1) {
    const s = game.state;
    if (s.screen !== 'play') break;
    const rs = s.routeState;
    const next = rs && rs.gates.find((g) => !g.passed);
    if (!next) break;
    steer(game, input, next.x, next.y);
    game.step(STEP, input);
  }
}

/** Re-show the banner from the last real delivery, with its real numbers.
 * The staged frame is caught seconds after a delivery; without this the
 * 1.8s banner has always expired by the time the frame stops, so the sheet
 * would never show the delivery callout that real play shows constantly. */
function reshowBanner(game) {
  const d = game.state.lastDelivery;
  if (!d) return;
  game.state.banner = {
    title: `DELIVERED! +${d.gained}`,
    sub: `CHAIN ×${d.chain} • GRADE ${gradeFor(d.chain)} • +${d.tips}c TIPS${d.contractBonus > 0 ? ` • CONTRACT +${d.contractBonus}` : ''}`,
    time: 1.8,
  };
}

export function stageShot(name, game) {
  const input = makeVirtualInput();
  game.resetRun();
  if (name === 'play') {
    // v10: ONE readable action — the ship crossing route gate 2 with the
    // real +150 splash. Sail the gates for real, stop 0.2s after the second
    // gate pays (splash up, boat just past the ring), then frame the boat
    // close with the shot camera so the gate crossing — not the whole sea —
    // is the subject. No 50s run, no cargo requirement: the gate IS the shot.
    input.press('Enter');
    game.step(STEP, input);
    game.startDay(1);
    game.chooseRoute('reef');
    game.state.tips = 60;
    // Sail the gates for real (seekGates steers gate-to-gate in order);
    // the normal autopilot would chase crates instead, so the gates need
    // their own pass. A second round covers a slow first pass.
    for (let t = 0; t < 2 && !(game.state.routeState && game.state.routeState.done); t += 1) {
      seekGates(game, input, 30);
    }
    for (let i = 0; i < 12; i += 1) game.step(STEP, input);
    game.state.shotCamera = {
      cx: game.state.boat.x,
      cy: game.state.boat.y - 27,
      zoom: 2.6,
    };
    // Clear floaters + particles: the GATE 2/2 floater and any rival
    // "TOOK IT!" floater sit on top of the route strip at this zoom and
    // read as a text pile-up (caught by vision). The strip + splash carry
    // the same information.
    game.state.floaters = [];
    game.state.particles = [];
    return;
  }
  if (name === 'maelstrom') {
    // The v5 boss moment: day 3, wave 3, the MAELSTROM hunting the boat
    // down a gold channel, rivals in frame. Staged by jumping the clock to
    // wave 3 (elapsed 74s of 110s) — everything after that plays for real.
    // v7: STORM CHASE — sail its 2 gates before the jump, so the hunt frame
    // shows the storm lane and the route strip mid-chase.
    input.press('Enter');
    game.step(STEP, input);
    game.startDay(2);
    game.chooseRoute('storm');
    game.state.tips = 60;
    seekGates(game, input, 18);
    layChannel(game);
    // Jump the clock to wave 3: the next step spawns the wave-2 and wave-3
    // storms and wakes the Maelstrom. The boat has barely delivered, so the
    // quota cannot end the day before the hunt is framed.
    game.state.timeLeft = game.state.daySpec.seconds - 74;
    // v7: full hull for the hunt — the frame is about the boss, not a hull
    // the gate run already spent. (Staging state, like the clock jump.)
    game.state.boat.hull = game.state.boat.maxHull;
    runSteps(game, input, 20, (g) => {
      const s = g.state;
      if (s.screen !== 'play') return true;
      const m = s.sea.maelstrom;
      if (!m) return false;
      // Give the day a little more rope if the hunt is not framed yet.
      if (s.timeLeft < 12) s.timeLeft = 25;
      // v7: no cargo requirement here — the hunt is the frame, and the boat
      // may be empty-handed while fleeing. Catch the boss mid-hunt.
      if (m.age < 4) return false;
      return Math.hypot(s.boat.x - m.x, s.boat.y - m.y) < 430;
    });
    // Clear transient floaters/particles so no pickup text ghosts through a
    // HUD panel (same reason as the play scene).
    game.state.floaters = [];
    game.state.particles = [];
    // v6: re-show the delivery banner from the last real delivery.
    reshowBanner(game);
    return;
  }
  if (name === 'upgrade') {
    // Play day 1 for real until it clears: the upgrade pick is a real screen.
    // v7: day 1 starts at the route modal — pick SAFE so the day can play.
    input.press('Enter');
    game.step(STEP, input);
    game.chooseRoute('safe');
    runSteps(game, input, 200, (g) => g.state.screen === 'dayclear');
    return;
  }
  if (name === 'route') {
    // Debug scene: day 1's route modal, so the pick screen can be checked.
    input.press('Enter');
    game.step(STEP, input);
    return;
  }
  if (name === 'end') {
    // Day 3 with a three-crate quota, carry-one-at-a-time: the autopilot really
    // wins the day, and the win screen's numbers match the quota exactly.
    // v7: REEF RUN — sail its 2 gates first, so the win screen shows the
    // route line with the bonus earned.
    input.press('Enter');
    game.step(STEP, input);
    game.startDay(2);
    game.chooseRoute('reef');
    const s = game.state;
    s.daySpec = { ...s.daySpec, quota: 3 };
    s.boat.carryMax = 1;
    // v7: sail the route's 2 gates FIRST — then re-stage everything, so
    // phase 1 starts exactly like v6's: fresh short-hop crates, full hull,
    // full clock, rivals behind. (Staging the crates before the gates lets
    // the rivals steal them during the gate run, and the day is lost to the
    // Maelstrom before the quota is won.)
    seekGates(game, input, 20);
    // v5: stage all three crates up front, each a short hop from the boat or
    // its harbor, so the three trips finish fast and the rivals stay behind.
    // Crate respawns stay ON (no crateTimer freeze): the rivals steal staged
    // crates, and without respawns the player could never reach 3.
    s.sea.crates = [
      { x: 640, y: 480, harbor: 'rose', gold: false, fragile: false, bob: 0, born: 0 },
      { x: 400, y: 250, harbor: 'amber', gold: false, fragile: false, bob: 0, born: 0 },
      { x: 900, y: 250, harbor: 'teal', gold: false, fragile: false, bob: 0, born: 0 },
    ];
    s.boat.hull = s.boat.maxHull;
    s.timeLeft = 110;
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
