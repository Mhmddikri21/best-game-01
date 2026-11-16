// Wind, gusts and current: the forces that make route-planning matter.
// Wind veers slowly; gusts are visible streaks that cross the sea and push the boat.
// The current is a slow drift in its own direction. Both are drawn as moving streaks.

import { CURRENT, STORM, VIEW, WIND } from './config.js';
import { angleDiff, clamp, pick, range } from './random.js';

export function createWind(rng, dayIndex = 0) {
  const wind = {
    angle: range(rng, 0, Math.PI * 2),
    // The wind veers faster on later days — the compass visibly swings more.
    veer: WIND.turnPerSec * (1 + 0.6 * dayIndex),
    gusts: [],
    gustTimer: 2,
    currentAngle: range(rng, 0, Math.PI * 2),
    time: 0,
  };
  return wind;
}

export function stepWind(wind, dt, rng) {
  wind.time += dt;
  wind.angle += (wind.veer ?? WIND.turnPerSec) * dt;
  wind.currentAngle += CURRENT.turnPerSec * dt;
  wind.gustTimer -= dt;
  if (wind.gustTimer <= 0) {
    wind.gustTimer = WIND.gustEverySec + range(rng, -1.5, 1.5);
    const angle = wind.angle + range(rng, -0.35, 0.35);
    const start = pick(rng, ['top', 'left', 'right']);
    let x;
    let y;
    if (start === 'top') { x = range(rng, 0, VIEW.width); y = -40; }
    else if (start === 'left') { x = -40; y = range(rng, 0, VIEW.height); }
    else { x = VIEW.width + 40; y = range(rng, 0, VIEW.height); }
    wind.gusts.push({ x, y, angle, life: WIND.gustLifeSec, maxLife: WIND.gustLifeSec });
  }
  for (const gust of wind.gusts) {
    const speed = 260;
    gust.x += Math.cos(gust.angle) * speed * dt;
    gust.y += Math.sin(gust.angle) * speed * dt;
    gust.life -= dt;
  }
  wind.gusts = wind.gusts.filter((g) => g.life > 0);
}

/** 0..1 how much the wind helps a boat heading `heading` (1 = dead downwind). */
export function windHelp(windAngle, heading) {
  const diff = Math.abs(angleDiff(windAngle, heading));
  // diff 0 = running before the wind (fast), diff PI = beating into it (slow).
  return clamp(1 - (diff / Math.PI) * 0.62, 0.38, 1.55);
}

/** Push from any gust whose streak the point is inside; also returns the gust for the render. */
export function gustAt(wind, x, y) {
  for (const gust of wind.gusts) {
    const dx = x - gust.x;
    const dy = y - gust.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 110) return gust;
  }
  return null;
}

export function currentVector(wind) {
  return { x: Math.cos(wind.currentAngle) * CURRENT.speed, y: Math.sin(wind.currentAngle) * CURRENT.speed };
}

export function windName(angle) {
  const names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const idx = Math.round(((angle % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8;
  return names[idx];
}

export function stormAt(storms, x, y) {
  for (const storm of storms) {
    if (Math.hypot(x - storm.x, y - storm.y) < STORM.radius) return storm;
  }
  return null;
}
