// game/src/pirates.js
// v8: The daily pirate raid: BLACKJACK threatens the mailboat while HOOK hunts crates.

import { PIRATE, VIEW } from './config.js';
import { angleDiff, clamp, range } from './random.js';
import { currentVector, windHelp } from './wind.js';
import { inChannel } from './buoys.js';

function nearest(list, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const item of list) {
    const d = Math.hypot(item.x - x, item.y - y);
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return { item: best, dist: bestD };
}

function routeGates(state) {
  return state.routeState?.gates ?? [];
}

function spawnSpot(state) {
  const rng = state.rng ?? Math.random;
  const boat = state.boat;
  const harbors = state.sea.harbors ?? [];
  const gates = routeGates(state);

  for (let tries = 0; tries < 100; tries += 1) {
    const angle = range(rng, 0, Math.PI * 2);
    const distance = range(rng, 500, 700);
    const x = boat.x + Math.cos(angle) * distance;
    const y = boat.y + Math.sin(angle) * distance;
    if (x < 40 || x > VIEW.width - 40 || y < 40 || y > VIEW.height - 40) continue;
    if (Math.hypot(x - boat.x, y - boat.y) < 350) continue;

    let clear = true;
    for (const harbor of harbors) {
      if (Math.hypot(x - harbor.x, y - harbor.y) < 350) clear = false;
    }
    for (const gate of gates) {
      if (Math.hypot(x - gate.x, y - gate.y) < 350) clear = false;
    }
    for (const rock of state.sea.rocks ?? []) {
      if (Math.hypot(x - rock.x, y - rock.y) < rock.r + 60) clear = false;
    }
    if (clear) return { x, y };
  }

  // v8: Fall back to whichever corner is farthest from the player.
  const corners = [
    { x: 48, y: 48 },
    { x: VIEW.width - 48, y: 48 },
    { x: 48, y: VIEW.height - 48 },
    { x: VIEW.width - 48, y: VIEW.height - 48 },
  ];
  corners.sort((a, b) => (
    Math.hypot(b.x - boat.x, b.y - boat.y) - Math.hypot(a.x - boat.x, a.y - boat.y)
  ));
  return corners[0];
}

function makeRaider(state, kind) {
  const spot = spawnSpot(state);
  return {
    kind,
    name: kind === 'blackjack' ? 'BLACKJACK' : 'HOOK',
    x: spot.x,
    y: spot.y,
    heading: Math.atan2(state.boat.y - spot.y, state.boat.x - spot.x),
    speed: 0,
    mode: kind === 'blackjack' ? 'chase' : 'hunt',
    wake: [],
    lean: 0,
    lockT: 0,
    retreatT: 0,
    stunT: 0,
    resumeMode: null,
    targetCrate: null,
    stealT: 0,
    stolen: null,
    escapeT: 0,
    gateShaken: false,
  };
}

export function createPirateSystem() {
  return {
    started: false,
    active: false,
    raidAge: 0,
    hookSpawnAt: null,
    raiders: [],
    awarded: false,
    rams: 0,
    lastRamAt: -Infinity,
    hookExpected: false,
    hookSpawned: false,
    blackjackGone: false,
    hookGone: false,
    endCounted: false,
  };
}

export function startRaid(state) {
  if (state.screen !== 'play') return;
  if (!state.pirates) state.pirates = createPirateSystem();
  const system = state.pirates;
  if (system.started) return;

  system.started = true;
  system.active = true;
  system.raidAge = 0;
  system.rams = 0;
  system.lastRamAt = -Infinity;
  system.awarded = false;
  system.endCounted = false;
  system.hookExpected = state.dayIndex >= 1;
  system.hookSpawned = false;
  system.blackjackGone = false;
  system.hookGone = !system.hookExpected;
  system.hookSpawnAt = system.hookExpected ? 14 : null;
  system.raiders = [makeRaider(state, 'blackjack')];

  state.stats.pirateRaids = (state.stats.pirateRaids ?? 0) + 1;
  state.banner = {
    title: 'PIRATE RAID!',
    sub: state.dayIndex >= 1
      ? 'BLACKJACK IN THE WATER · HOOK IS HUNTING CRATES'
      : 'BLACKJACK IN THE WATER',
    time: 2.2,
  };
  state.message = 'PIRATE RAID — GUST BREAKS LOCK · GATES SHAKE PURSUIT';
  state.messageTime = 3;
}

export function clearPirates(state) {
  if (!state.pirates) return;
  state.pirates.raiders = [];
  state.pirates.active = false;
}

function dropStolenCrate(state, raider) {
  if (!raider.stolen) return false;
  const crate = raider.stolen;
  crate.x = raider.x;
  crate.y = raider.y;
  crate.bob = 0;
  crate.born = 0;
  state.sea.crates.push(crate);
  raider.stolen = null;
  return true;
}

function rewardRecoveredCrate(state) {
  state.score += PIRATE.crateRecoverScore;
  state.tips += PIRATE.crateRecoverTips;
  state.stats.cratesRecovered = (state.stats.cratesRecovered ?? 0) + 1;
  state.banner = {
    title: 'CRATE RECOVERED +75',
    sub: 'HOOK DROPPED THE LOOT',
    time: 2,
  };
}

function nearestEdgeTarget(raider) {
  const edges = [
    { x: 0, y: raider.y, d: raider.x },
    { x: VIEW.width, y: raider.y, d: VIEW.width - raider.x },
    { x: raider.x, y: 0, d: raider.y },
    { x: raider.x, y: VIEW.height, d: VIEW.height - raider.y },
  ];
  edges.sort((a, b) => a.d - b.d);
  return edges[0];
}

function startRetreat(raider, duration = PIRATE.retreatSec, resumeMode = null) {
  raider.mode = 'retreat';
  raider.retreatT = duration;
  if (resumeMode) raider.resumeMode = resumeMode;
}

function steerAndMove(state, raider, target, dt, baseSpeed, fx) {
  if (!target) return;

  let want = Math.atan2(target.y - raider.y, target.x - raider.x);
  const rock = nearest(state.sea.rocks ?? [], raider.x, raider.y);
  if (rock.item && rock.dist < rock.item.r + 60) {
    want = Math.atan2(raider.y - rock.item.y, raider.x - rock.item.x);
  }

  const storm = nearest(state.sea.storms ?? [], raider.x, raider.y);
  if (storm.item && storm.dist < 130) {
    const toTarget = Math.atan2(target.y - raider.y, target.x - raider.x);
    const toStorm = Math.atan2(storm.item.y - raider.y, storm.item.x - raider.x);
    if (Math.abs(angleDiff(toTarget, toStorm)) < Math.PI / 2) {
      want = Math.atan2(raider.y - storm.item.y, raider.x - storm.item.x);
    }
  }

  const maelstrom = state.sea.maelstrom;
  if (maelstrom && Math.hypot(raider.x - maelstrom.x, raider.y - maelstrom.y) < maelstrom.r + 80) {
    const toTarget = Math.atan2(target.y - raider.y, target.x - raider.x);
    const toMaelstrom = Math.atan2(maelstrom.y - raider.y, maelstrom.x - raider.x);
    if (Math.abs(angleDiff(toTarget, toMaelstrom)) < Math.PI / 2) {
      want = Math.atan2(raider.y - maelstrom.y, raider.x - maelstrom.x);
    }
  }

  const diff = angleDiff(raider.heading, want);
  raider.heading += clamp(diff, -PIRATE.turnRate * dt, PIRATE.turnRate * dt);
  raider.lean = clamp(
    raider.lean + (clamp(diff, -1, 1) * 0.9 - raider.lean) * dt * 6,
    -1,
    1,
  );

  let targetSpeed = baseSpeed * windHelp(state.wind.angle, raider.heading);
  if (inChannel(state.sea.buoys, raider.x, raider.y)) targetSpeed *= PIRATE.channelSlow;
  raider.speed += clamp(targetSpeed - raider.speed, -260 * dt, 260 * dt);

  const current = currentVector(state.wind);
  const vx = Math.cos(raider.heading) * raider.speed + current.x * 0.5;
  const vy = Math.sin(raider.heading) * raider.speed + current.y * 0.5;
  raider.x = clamp(raider.x + vx * dt, 24, VIEW.width - 24);
  raider.y = clamp(raider.y + vy * dt, 24, VIEW.height - 24);

  for (const rockHit of state.sea.rocks ?? []) {
    const d = Math.hypot(raider.x - rockHit.x, raider.y - rockHit.y);
    if (d < rockHit.r + 14) {
      const angle = Math.atan2(raider.y - rockHit.y, raider.x - rockHit.x);
      raider.x = rockHit.x + Math.cos(angle) * (rockHit.r + 16);
      raider.y = rockHit.y + Math.sin(angle) * (rockHit.r + 16);
      raider.speed *= 0.4;
    }
  }

  raider.wake.push({ x: raider.x, y: raider.y, life: 1 });
  if (raider.wake.length > 30) raider.wake.shift();
  for (const wake of raider.wake) wake.life -= dt * 0.9;
  raider.wake = raider.wake.filter((wake) => wake.life > 0);

  if (fx?.burst && raider.speed > 0) {
    // v8: Keep this branch intentionally empty of effects; wakes are visual only.
  }
}

function stepBlackjack(state, raider, dt, fx, system) {
  const boat = state.boat;
  const distance = Math.hypot(boat.x - raider.x, boat.y - raider.y);

  if (raider.mode === 'stunned') {
    raider.stunT -= dt;
    raider.speed = 0;
    if (raider.stunT <= 0) {
      raider.mode = raider.resumeMode === 'retreat' ? 'retreat' : 'chase';
      raider.resumeMode = null;
    }
    return;
  }

  if (raider.mode === 'leaving') {
    const edge = nearestEdgeTarget(raider);
    steerAndMove(state, raider, edge, dt, PIRATE.blackjackBase, fx);
    return;
  }

  if (raider.mode === 'retreat') {
    raider.retreatT -= dt;
    const away = Math.atan2(raider.y - boat.y, raider.x - boat.x);
    steerAndMove(state, raider, {
      x: raider.x + Math.cos(away) * 500,
      y: raider.y + Math.sin(away) * 500,
    }, dt, PIRATE.blackjackBase, fx);
    if (raider.retreatT <= 0) {
      raider.mode = system.raidAge > PIRATE.raidDurationSec ? 'leaving' : 'chase';
    }
    return;
  }

  if (system.raidAge > PIRATE.raidDurationSec && raider.mode === 'chase') {
    raider.mode = 'leaving';
    return;
  }

  if (raider.mode === 'lock') {
    raider.speed = 0;
    if (distance > PIRATE.ramRange + 30) {
      raider.mode = 'chase';
      raider.lockT = 0;
      return;
    }
    raider.lockT -= dt;
    if (raider.lockT <= 0) {
      if (distance <= PIRATE.ramRange + 26) {
        boat.hull -= PIRATE.ramDamage;
        system.rams += 1;
        system.lastRamAt = system.raidAge;

        if (boat.cargo.length > 0) {
          const crate = boat.cargo.pop();
          crate.x = boat.x;
          crate.y = boat.y;
          crate.bob = 0;
          crate.born = 0;
          state.sea.crates.push(crate);
          fx.floater(boat.x, boat.y - 54, 'CRATE KNOCKED LOOSE!', '#ffc857', 18);
        }

        const away = Math.atan2(raider.y - boat.y, raider.x - boat.x);
        raider.x = clamp(
          raider.x + Math.cos(away) * PIRATE.ramKnockback,
          24,
          VIEW.width - 24,
        );
        raider.y = clamp(
          raider.y + Math.sin(away) * PIRATE.ramKnockback,
          24,
          VIEW.height - 24,
        );
        fx.floater(boat.x, boat.y - 82, `-${PIRATE.ramDamage} HULL`, '#ff6b5e', 20);
        fx.burst(boat.x, boat.y, '#ff6b5e', 14, 150);
        raider.mode = system.rams >= PIRATE.maxRamsPerDay ? 'leaving' : 'retreat';
        raider.retreatT = PIRATE.retreatSec;
      } else {
        raider.mode = 'chase';
      }
      raider.lockT = 0;
    }
    return;
  }

  if (
    distance <= PIRATE.ramRange
    && system.raidAge - system.lastRamAt >= PIRATE.ramCooldownSec
    && system.rams < PIRATE.maxRamsPerDay
  ) {
    raider.mode = 'lock';
    raider.lockT = PIRATE.ramWindupSec;
    raider.speed = 0;
    return;
  }

  steerAndMove(state, raider, boat, dt, PIRATE.blackjackBase, fx);
}

function stepHook(state, raider, dt, fx) {
  if (raider.mode === 'stunned') {
    raider.stunT -= dt;
    raider.speed = 0;
    if (raider.stunT <= 0) {
      raider.mode = raider.resumeMode ?? 'hunt';
      raider.resumeMode = null;
    }
    return;
  }

  if (raider.mode === 'leaving') {
    steerAndMove(state, raider, nearestEdgeTarget(raider), dt, PIRATE.hookFleeBase, fx);
    return;
  }

  // v8: the raid has a lifetime — when it expires HOOK leaves too (unless
  // it is mid-flight with a stolen crate; that escape still plays out).
  // Without this, a HOOK that never stole a crate would hunt forever and
  // the raid would never end, so the repel reward would never fire.
  if (
    state.pirates.raidAge > PIRATE.raidDurationSec
    && raider.mode !== 'flee'
  ) {
    raider.mode = 'leaving';
    return;
  }

  if (raider.mode === 'retreat') {
    raider.retreatT -= dt;
    const away = Math.atan2(raider.y - state.boat.y, raider.x - state.boat.x);
    steerAndMove(state, raider, {
      x: raider.x + Math.cos(away) * 500,
      y: raider.y + Math.sin(away) * 500,
    }, dt, PIRATE.hookBase, fx);
    if (raider.retreatT <= 0) {
      raider.mode = raider.resumeMode ?? (state.sea.crates.length ? 'hunt' : 'follow');
      raider.resumeMode = null;
    }
    return;
  }

  if (raider.mode === 'hunt') {
    if (raider.targetCrate && !state.sea.crates.includes(raider.targetCrate)) {
      raider.targetCrate = null;
    }
    if (!raider.targetCrate) {
      raider.targetCrate = nearest(state.sea.crates, raider.x, raider.y).item;
    }
    if (!raider.targetCrate) {
      raider.mode = 'follow';
      return;
    }
    if (Math.hypot(raider.targetCrate.x - raider.x, raider.targetCrate.y - raider.y) <= PIRATE.hookStealRange) {
      raider.mode = 'steal';
      raider.stealT = PIRATE.hookStealSec;
      raider.speed = 0;
      return;
    }
    steerAndMove(state, raider, raider.targetCrate, dt, PIRATE.hookBase, fx);
    return;
  }

  if (raider.mode === 'steal') {
    if (!raider.targetCrate || !state.sea.crates.includes(raider.targetCrate)) {
      raider.targetCrate = null;
      raider.mode = 'hunt';
      return;
    }
    raider.speed = 0;
    raider.stealT -= dt;
    if (raider.stealT <= 0) {
      const index = state.sea.crates.indexOf(raider.targetCrate);
      if (index < 0) {
        raider.targetCrate = null;
        raider.mode = 'hunt';
        return;
      }
      raider.stolen = state.sea.crates.splice(index, 1)[0];
      raider.targetCrate = null;
      raider.mode = 'flee';
      raider.escapeT = PIRATE.hookEscapeSec;
      fx.floater(raider.x, raider.y - 58, 'HOOK STOLE A CRATE!', '#ffb347', 18);
    }
    return;
  }

  if (raider.mode === 'flee') {
    raider.escapeT = Math.max(0, raider.escapeT - dt);
    steerAndMove(state, raider, nearestEdgeTarget(raider), dt, PIRATE.hookFleeBase, fx);
    if (
      raider.x <= 30
      || raider.x >= VIEW.width - 30
      || raider.y <= 30
      || raider.y >= VIEW.height - 30
    ) {
      raider.stolen = null;
      state.stats.cratesLost = (state.stats.cratesLost ?? 0) + 1;
      state.message = 'HOOK ESCAPED WITH THE CRATE';
      state.messageTime = 2.5;
      fx.floater(raider.x, raider.y - 58, 'CRATE LOST!', '#ff6b5e', 18);
      raider.mode = 'leaving';
    }
    return;
  }

  if (raider.mode === 'follow') {
    if (state.sea.crates.length > 0) {
      raider.mode = 'hunt';
      return;
    }
    steerAndMove(state, raider, state.boat, dt, PIRATE.hookBase * PIRATE.hookFollowFactor, fx);
  }
}

function finishRaid(state, system) {
  if (system.endCounted) return;
  system.endCounted = true;
  system.active = false;
  state.stats.pirateRams = (state.stats.pirateRams ?? 0) + system.rams;

  if (!system.awarded && system.rams < PIRATE.maxRamsPerDay) {
    system.awarded = true;
    state.score += PIRATE.raidRepelScore;
    state.tips += PIRATE.raidRepelTips;
    state.stats.piratesRepelled = (state.stats.piratesRepelled ?? 0) + 1;
    state.banner = {
      title: 'RAID REPELLED +100',
      sub: 'BLACKJACK TURNED AWAY',
      time: 2,
    };
  }
}

export function stepPirates(state, dt, fx) {
  if (!state.pirates || !state.pirates.active) return null;
  if (state.screen !== 'play') {
    clearPirates(state);
    return null;
  }

  const system = state.pirates;
  system.raidAge += dt;

  if (
    system.hookExpected
    && !system.hookSpawned
    && system.raidAge >= system.hookSpawnAt
  ) {
    system.hookSpawned = true;
    system.raiders.push(makeRaider(state, 'hook'));
  }

  let sunkReason = null;
  for (let i = system.raiders.length - 1; i >= 0; i -= 1) {
    const raider = system.raiders[i];
    if (raider.kind === 'blackjack') stepBlackjack(state, raider, dt, fx, system);
    else stepHook(state, raider, dt, fx);

    if (raider.kind === 'blackjack' && raider.mode === 'leaving' && (
      raider.x <= 30
      || raider.x >= VIEW.width - 30
      || raider.y <= 30
      || raider.y >= VIEW.height - 30
    )) {
      system.blackjackGone = true;
      system.raiders.splice(i, 1);
    } else if (raider.kind === 'hook' && raider.mode === 'leaving' && (
      raider.x <= 30
      || raider.x >= VIEW.width - 30
      || raider.y <= 30
      || raider.y >= VIEW.height - 30
    )) {
      system.hookGone = true;
      system.raiders.splice(i, 1);
    }
  }

  if (state.boat.hull <= 0) {
    state.boat.hull = 0;
    sunkReason = 'BLACKJACK rammed the mailboat apart.';
  }

  if (
    system.blackjackGone
    && (!system.hookExpected || system.hookGone)
  ) {
    finishRaid(state, system);
  }

  return sunkReason;
}

export function onPlayerGust(state) {
  const system = state.pirates;
  if (!system?.active || state.screen !== 'play') return;

  for (const raider of system.raiders) {
    if (raider.mode === 'leaving') continue;
    if (Math.hypot(raider.x - state.boat.x, raider.y - state.boat.y) > PIRATE.gustStunRange) continue;

    if (raider.kind === 'hook') {
      let resumeMode = raider.mode;
      if (raider.mode === 'flee' && raider.stolen) {
        if (dropStolenCrate(state, raider)) rewardRecoveredCrate(state);
        resumeMode = 'retreat';
      } else if (raider.mode === 'steal') {
        resumeMode = 'hunt';
      } else if (raider.mode === 'flee') {
        resumeMode = 'hunt';
      }
      raider.resumeMode = resumeMode;
    } else {
      raider.resumeMode = raider.mode === 'retreat' ? 'retreat' : 'chase';
    }
    raider.mode = 'stunned';
    raider.stunT = PIRATE.gustStunSec;
    raider.speed = 0;
  }
}

export function onRouteGate(state) {
  const system = state.pirates;
  if (!system?.active || state.screen !== 'play') return;

  for (const raider of system.raiders) {
    if (raider.gateShaken || raider.mode === 'leaving') continue;
    raider.gateShaken = true;

    if (raider.kind === 'hook') {
      let resumeMode = raider.mode;
      if (raider.stolen && dropStolenCrate(state, raider)) {
        rewardRecoveredCrate(state);
        resumeMode = state.sea.crates.length ? 'hunt' : 'follow';
      } else if (raider.mode === 'flee') {
        resumeMode = 'hunt';
      }
      raider.resumeMode = resumeMode;
    } else {
      raider.resumeMode = 'chase';
    }
    startRetreat(raider, PIRATE.retreatSec, raider.resumeMode);
  }
}

export function alertText(state) {
  if (state.screen !== 'play' || !state.pirates?.raiders?.length) return '';
  const raiders = state.pirates.raiders;
  const blackjack = raiders.find((raider) => raider.kind === 'blackjack');
  const hook = raiders.find((raider) => raider.kind === 'hook');

  if (blackjack?.mode === 'lock') {
    return `BLACKJACK — RAM LOCK ${Math.ceil(blackjack.lockT * 10) / 10}s · GUST TO BREAK`;
  }
  if (hook?.mode === 'steal') {
    return `HOOK — STEALING ${Math.ceil(hook.stealT * 10) / 10}s · GUST TO BREAK`;
  }
  if (hook?.mode === 'flee') {
    return `HOOK — CRATE ESCAPES IN ${Math.ceil(hook.escapeT)}s · GUST TO BREAK`;
  }
  if (hook && ['hunt', 'follow'].includes(hook.mode)) {
    return 'PIRATE RAID — HOOK HUNTING CRATES · GUST TO BREAK';
  }
  return 'PIRATE RAID — BLACKJACK HUNTING · GUST TO BREAK';
}
