// Rival mail-boats: the v4 race layer. One rival on day 1, two from day 2.
// Rivals sail the same sea, chase the same floating crates, and deliver them
// to the matching harbor — first to the crate wins it. They are real
// competitors, not scenery: they pick crates up (the crate leaves the sea),
// carry one at a time, and bank a delivery at the harbor, which the race
// scoreboard and the OUTRACE contract both track. They are a touch slower
// than a good player — no gust burst, no buoy channel of their own — so the
// day stays winnable by playing well. rivals.js owns the rules; main.js owns
// the step order; render.js draws them.

import { BOAT, RIVAL, RIVAL_DEFS } from './config.js';
import { angleDiff, clamp, range } from './random.js';
import { currentVector, windHelp } from './wind.js';
import { harborById } from './sea.js';
import { onRivalDelivery } from './contracts.js';

function nearest(list, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const item of list) {
    const d = Math.hypot(item.x - x, item.y - y);
    if (d < bestD) { bestD = d; best = item; }
  }
  return { item: best, dist: bestD };
}

/** A spawn spot in open water: clear of harbors and rocks. */
function freeSpot(rng, sea) {
  for (let tries = 0; tries < 40; tries += 1) {
    const x = range(rng, 120, 1160);
    const y = range(rng, 120, 600);
    let ok = true;
    for (const h of sea.harbors) if (Math.hypot(x - h.x, y - h.y) < 160) ok = false;
    for (const r of sea.rocks) if (Math.hypot(x - r.x, y - r.y) < r.r + 70) ok = false;
    if (ok) return { x, y };
  }
  return { x: 320, y: 320 };
}

export function createRivals(rng, sea, daySpec) {
  const count = daySpec.day === 1 ? 1 : 2;
  return RIVAL_DEFS.slice(0, count).map((def) => {
    const spot = freeSpot(rng, sea);
    return {
      ...def,
      speedFactor: def.speed,
      x: spot.x,
      y: spot.y,
      heading: range(rng, 0, Math.PI * 2),
      speed: 0,
      cargo: null,
      target: null,
      delivered: 0,
      wake: [],
      lean: 0,
    };
  });
}

/**
 * Step every rival one tick. Returns the contracts completed by rival
 * deliveries this tick (main.js scores them), so a rival banking a crate can
 * finish the OUTRACE contract for the player to chase.
 */
export function stepRivals(state, dt, fx) {
  const done = [];
  for (const r of state.rivals) {
    // Pick a target: the nearest floating crate, or its harbor once loaded.
    if (!r.cargo) {
      const { item } = nearest(state.sea.crates, r.x, r.y);
      r.target = item ?? null;
    } else {
      r.target = harborById(state.sea, r.cargo.harbor);
    }
    if (!r.target) continue;

    // Steer, keeping clear of hazards actually in the way — the same rule
    // the autopilot uses, so rivals look like they are sailing, not fleeing.
    let want = Math.atan2(r.target.y - r.y, r.target.x - r.x);
    const rock = nearest(state.sea.rocks, r.x, r.y);
    if (rock.item && rock.dist < rock.item.r + 60) {
      want = Math.atan2(r.y - rock.item.y, r.x - rock.item.x);
    }
    const storm = nearest(state.sea.storms, r.x, r.y);
    if (storm.item && storm.dist < 130) {
      const toTarget = Math.atan2(r.target.y - r.y, r.target.x - r.x);
      const toStorm = Math.atan2(storm.item.y - r.y, storm.item.x - r.x);
      if (Math.abs(angleDiff(toTarget, toStorm)) < Math.PI / 2) {
        want = Math.atan2(r.y - storm.item.y, r.x - storm.item.x);
      }
    }
    const diff = angleDiff(r.heading, want);
    r.heading += clamp(diff, -RIVAL.turnRate * dt, RIVAL.turnRate * dt);
    r.lean = clamp(r.lean + (clamp(diff, -1, 1) * 0.9 - r.lean) * dt * 6, -1, 1);

    // Rivals catch the wind like the player, but with no gust burst and no
    // buoy channel — that is the player's edge in the race.
    const help = windHelp(state.wind.angle, r.heading);
    const target = RIVAL.baseSpeed * r.speedFactor * help;
    r.speed += clamp(target - r.speed, -260 * dt, 260 * dt);
    let vx = Math.cos(r.heading) * r.speed;
    let vy = Math.sin(r.heading) * r.speed;
    const cur = currentVector(state.wind);
    vx += cur.x * 0.5;
    vy += cur.y * 0.5;
    r.x = clamp(r.x + vx * dt, 24, 1280 - 24);
    r.y = clamp(r.y + vy * dt, 24, 720 - 24);

    // Rocks bounce rivals the way they bounce the player (no hull, no sink).
    for (const rockHit of state.sea.rocks) {
      const d = Math.hypot(r.x - rockHit.x, r.y - rockHit.y);
      if (d < rockHit.r + 14) {
        const a = Math.atan2(r.y - rockHit.y, r.x - rockHit.x);
        r.x = rockHit.x + Math.cos(a) * (rockHit.r + 16);
        r.y = rockHit.y + Math.sin(a) * (rockHit.r + 16);
        r.speed *= 0.4;
      }
    }

    // Wake trail (visual only, capped).
    r.wake.push({ x: r.x, y: r.y, life: 1 });
    if (r.wake.length > 30) r.wake.shift();
    for (const w of r.wake) w.life -= dt * 0.9;
    r.wake = r.wake.filter((w) => w.life > 0);

    // Pickups: the crate leaves the sea — the player can lose a crate they
    // were sailing for, which is the whole point of the race.
    if (!r.cargo) {
      for (let i = state.sea.crates.length - 1; i >= 0; i -= 1) {
        const c = state.sea.crates[i];
        if (Math.hypot(r.x - c.x, r.y - c.y) < RIVAL.pickupRadius + 8) {
          state.sea.crates.splice(i, 1);
          r.cargo = c;
          fx.floater(r.x, r.y - 66, `${r.name} TOOK IT!`, r.color, 16);
          break;
        }
      }
    } else {
      // Deliveries: bank the crate at its harbor and count it on the board.
      const h = harborById(state.sea, r.cargo.harbor);
      if (Math.hypot(r.x - h.x, r.y - h.y) < RIVAL.harborRadius) {
        r.delivered += 1;
        state.race.rivals[r.id] = (state.race.rivals[r.id] ?? 0) + 1;
        state.raceTotal.rivals[r.id] = (state.raceTotal.rivals[r.id] ?? 0) + 1;
        fx.floater(h.x, h.y - 90, `${r.name} +1`, r.color, 20);
        fx.burst(h.x, h.y, r.color, 10, 120);
        h.pulse = 1;
        done.push(...onRivalDelivery(state));
        r.cargo = null;
      }
    }
  }
  return done;
}
