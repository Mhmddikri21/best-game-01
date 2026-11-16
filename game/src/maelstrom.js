// The MAELSTROM: day 3's final-wave boss storm. One huge cell that slowly
// chases the player's boat — never the rivals, never the harbors. It is
// beatable on purpose: the boat outruns it downwind, the buoy channel halves
// its damage, and a gust burst breaks the chase. Outlast its 20-second hunt
// (or finish the day's quota while it hunts) and the sea calms for +250.
// maelstrom.js owns the chase; main.js owns the timer, damage and bonus;
// render.js draws it.

import { MAELSTROM, VIEW } from './config.js';
import { angleDiff, clamp, range } from './random.js';

/** Spawn the boss storm on the far side of the map from the boat. */
export function spawnMaelstrom(sea, rng, boat) {
  let x = VIEW.width / 2;
  let y = 120;
  for (let tries = 0; tries < 20; tries += 1) {
    x = range(rng, 120, VIEW.width - 120);
    y = range(rng, 120, VIEW.height - 120);
    if (Math.hypot(x - boat.x, y - boat.y) > 450) break;
  }
  const m = {
    x,
    y,
    angle: Math.atan2(boat.y - y, boat.x - x),
    speed: MAELSTROM.speed,
    r: MAELSTROM.radius,
    timer: MAELSTROM.surviveSec,
    age: 0,
  };
  sea.maelstrom = m;
  return m;
}

/** One tick of the hunt: turn toward the boat (limited turn rate) and advance. */
export function stepMaelstrom(m, boat, dt) {
  const want = Math.atan2(boat.y - m.y, boat.x - m.x);
  const diff = angleDiff(m.angle, want);
  m.angle += clamp(diff, -1.1 * dt, 1.1 * dt);
  m.x = clamp(m.x + Math.cos(m.angle) * m.speed * dt, 60, VIEW.width - 60);
  m.y = clamp(m.y + Math.sin(m.angle) * m.speed * dt, 60, VIEW.height - 60);
  m.timer -= dt;
  m.age += dt;
}
