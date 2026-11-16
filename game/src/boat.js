// The mail-boat: heading, sail, speed, hull, cargo and the gust burst.
// Physics are simple on purpose: turn, catch the wind, mind the rocks.

import { BOAT, GUST, VIEW } from './config.js';
import { angleDiff, clamp } from './random.js';
import { currentVector, gustAt, windHelp } from './wind.js';

export function createBoat(upgrades) {
  return {
    x: VIEW.width / 2,
    y: VIEW.height - 110,
    heading: -Math.PI / 2,
    speed: 0,
    sail: 1, // 0 reefed .. 1 full
    hull: BOAT.hull,
    maxHull: BOAT.hull,
    cargo: [],
    carryMax: BOAT.carryBase,
    gust: GUST.max,
    gustTime: 0,
    lean: 0,
    wake: [],
    invuln: 0,
    ...upgrades,
  };
}

export function stepBoat(boat, input, wind, sea, dt, events) {
  const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  boat.heading += turn * BOAT.turnRate * (boat.turnMod ?? 1) * dt;
  boat.lean = clamp(boat.lean + (turn * 0.9 - boat.lean) * dt * 6, -1, 1);

  if (input.sailUp) boat.sail = clamp(boat.sail + dt * 1.4, 0, 1);
  if (input.sailDown) boat.sail = clamp(boat.sail - dt * 1.8, 0, 1);

  // Waypoint steering: turn toward the clicked point, ease off on arrival.
  if (input.waypoint) {
    const dx = input.waypoint.x - boat.x;
    const dy = input.waypoint.y - boat.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 26) input.clearWaypoint();
    else {
      const want = Math.atan2(dy, dx);
      const diff = angleDiff(boat.heading, want);
      boat.heading += clamp(diff, -BOAT.turnRate * dt, BOAT.turnRate * dt);
      boat.sail = 1;
    }
  }

  const help = windHelp(wind.angle, boat.heading);
  const target = BOAT.baseSpeed * (boat.speedMod ?? 1) * boat.sail * help;
  boat.speed += clamp(target - boat.speed, -BOAT.accel * dt, BOAT.accel * dt);

  if (input.wasPressed('Space') && boat.gust >= GUST.cost && boat.gustTime <= 0) {
    boat.gust -= GUST.cost;
    boat.gustTime = GUST.duration;
    events.push({ type: 'gust' });
  }
  if (boat.gustTime > 0) {
    boat.gustTime -= dt;
    boat.speed += GUST.impulse * dt;
  }
  boat.gust = clamp(boat.gust + GUST.regenPerSec * dt, 0, GUST.max);

  const gust = gustAt(wind, boat.x, boat.y);
  let vx = Math.cos(boat.heading) * boat.speed;
  let vy = Math.sin(boat.heading) * boat.speed;
  if (gust) {
    vx += Math.cos(gust.angle) * 90;
    vy += Math.sin(gust.angle) * 90;
  }
  const cur = currentVector(wind);
  vx += cur.x;
  vy += cur.y;

  boat.x = clamp(boat.x + vx * dt, 24, VIEW.width - 24);
  boat.y = clamp(boat.y + vy * dt, 24, VIEW.height - 24);

  // Wake trail (visual only, capped).
  boat.wake.push({ x: boat.x, y: boat.y, life: 1 });
  if (boat.wake.length > 42) boat.wake.shift();
  for (const w of boat.wake) w.life -= dt * 0.9;
  boat.wake = boat.wake.filter((w) => w.life > 0);

  boat.invuln = Math.max(0, boat.invuln - dt);
  return boat;
}

export function rockHit(boat, rock) {
  if (boat.invuln > 0) return false;
  const d = Math.hypot(boat.x - rock.x, boat.y - rock.y);
  if (d < rock.r + BOAT.radius - 2) {
    boat.hull -= BOAT.rockDamage;
    boat.invuln = 0.9;
    // Bounce off the rock.
    const a = Math.atan2(boat.y - rock.y, boat.x - rock.x);
    boat.x = rock.x + Math.cos(a) * (rock.r + BOAT.radius);
    boat.y = rock.y + Math.sin(a) * (rock.r + BOAT.radius);
    boat.speed *= 0.3;
    return true;
  }
  return false;
}
