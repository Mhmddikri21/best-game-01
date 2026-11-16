// WINDWARD POST — game loop, screens and rules.
// Owns the state; render.js only draws it, boat.js/sea.js/wind.js only step it.

import { BOAT, DAYS, GUST, SCORE, VIEW } from './config.js';
import { clamp, makeRng } from './random.js';
import { createAudio } from './audio.js';
import { createBoat, rockHit, stepBoat } from './boat.js';
import { createRenderer } from './render.js';
import { createSea, harborById, spawnCrate, stepSea } from './sea.js';
import { createInput } from './input.js';
import { createWind, stepWind, stormAt } from './wind.js';
import { offerUpgrades } from './upgrades.js';
import { buildContracts, onDelivery, onRock, onStorm } from './contracts.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;

function loadBest() {
  try { return Number(window.localStorage.getItem('windward-post-best') ?? 0) || 0; }
  catch { return 0; }
}

function saveBest(score) {
  try { window.localStorage.setItem('windward-post-best', String(score)); } catch { /* no storage */ }
}

export function createGame(canvas, seed) {
  const renderer = createRenderer(canvas);
  const audio = createAudio();
  const rng = makeRng(seed);
  const game = {
    canvas,
    rng,
    audio,
    state: null,
  };

  function resetRun() {
    game.state = {
      screen: 'title',
      time: 0,
      seed,
      dayIndex: 0,
      daySpec: DAYS[0],
      timeLeft: DAYS[0].seconds,
      delivered: 0,
      score: 0,
      tips: 0,
      chain: 1,
      best: loadBest(),
      owned: [],
      upgradeMods: {},
      offers: [],
      loseReason: '',
      message: '',
      messageTime: 0,
      particles: [],
      floaters: [],
      contracts: [],
      contractRewards: 0,
      chainStreak: 0,
      stats: { delivered: 0, gold: 0, fragile: 0, contractsDone: 0, crashes: 0, bestChain: 1 },
      wind: createWind(rng),
      sea: createSea(rng, DAYS[0]),
      boat: createBoat({}),
    };
  }

  function startDay(dayIndex) {
    const s = game.state;
    s.dayIndex = dayIndex;
    s.daySpec = DAYS[dayIndex];
    s.timeLeft = s.daySpec.seconds;
    s.delivered = 0;
    s.contracts = buildContracts(rng);
    s.contractRewards = 0;
    s.chainStreak = 0;
    s.wind.veer = s.daySpec.veer;
    s.sea = createSea(rng, s.daySpec);
    const keep = { ...s.upgradeMods };
    s.boat = createBoat(keep);
    s.boat.gustMax = keep.gustMax ?? GUST.max;
    s.boat.gust = s.boat.gustMax;
    s.screen = 'play';
    s.message = `DAY ${dayIndex + 1} — DELIVER ${s.daySpec.quota} CRATES BEFORE SUNSET`;
    s.messageTime = 3;
  }

  function burst(x, y, color, n, speed) {
    const s = game.state;
    for (let i = 0; i < n; i += 1) {
      const a = rng() * Math.PI * 2;
      const v = speed * (0.4 + rng() * 0.8);
      s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, maxLife: 0.7, color, size: 2 + rng() * 3 });
    }
  }

  function floater(x, y, str, color, size = 20) {
    game.state.floaters.push({ x, y, str, color, size, life: 1.4, maxLife: 1.4 });
  }

  function completeContracts(done) {
    const s = game.state;
    for (const c of done) {
      s.score += c.reward;
      floater(s.boat.x, s.boat.y - 66, `CONTRACT ${c.name} +${c.reward}`, '#ffc857', 20);
      s.message = `CONTRACT DONE — ${c.name} +${c.reward}`;
      s.messageTime = 2;
    }
    if (done.length > 0) audio.gold();
  }

  function rockCrashFX() {
    const s = game.state;
    s.stats.crashes += 1;
    s.chainStreak = 0;
    onRock(s);
    // A fragile crate in the hold shatters on a rock hit — the risk of the double pay.
    const fi = s.boat.cargo.findIndex((c) => c.fragile);
    if (fi >= 0) {
      s.boat.cargo.splice(fi, 1);
      floater(s.boat.x, s.boat.y - 66, 'FRAGILE CRATE LOST!', '#ff6b5e', 18);
      s.message = 'A fragile crate shattered on the rock!';
      s.messageTime = 2;
    }
    if (s.chain > 1) s.chain = 1;
    audio.crash();
    burst(s.boat.x, s.boat.y, '#bfe8dd', 18, 160);
    floater(s.boat.x, s.boat.y - 34, `-${BOAT.rockDamage} HULL`, '#ff6b5e', 18);
    if (s.boat.hull <= 0) {
      s.boat.hull = 0;
      endRun(false, 'Your hull gave out — the mailboat went down with the post.');
    }
  }

  function endRun(won, reason) {
    const s = game.state;
    s.loseReason = reason;
    s.screen = won ? 'win' : 'over';
    if (s.score > s.best) { s.best = s.score; saveBest(s.score); }
    if (won) audio.win(); else audio.lose();
  }

  function deliverAt(harbor) {
    const s = game.state;
    const mine = s.boat.cargo.filter((c) => c.harbor === harbor.id);
    if (mine.length === 0) return;
    for (const c of mine) {
      const base = c.gold ? SCORE.goldDelivery : c.fragile ? SCORE.fragileDelivery : SCORE.delivery;
      const gained = base + SCORE.chainStep * (s.chain - 1);
      s.score += gained;
      s.tips += c.gold ? SCORE.tipGold : c.fragile ? SCORE.tipFragile : SCORE.tipNormal;
      s.stats.delivered += 1;
      if (c.gold) s.stats.gold += 1;
      if (c.fragile) s.stats.fragile += 1;
      floater(harbor.x, harbor.y - 90, `+${gained}`, c.gold ? '#ffc857' : c.fragile ? '#cfe8ff' : '#7be0a3', 24);
      if (c.gold) audio.gold();
    }
    s.delivered += mine.length;
    s.chainStreak += mine.length;
    s.stats.bestChain = Math.max(s.stats.bestChain, s.chain);
    s.chain += 1;
    // Contract hooks: rush / gold / fragile / chain progress from these crates.
    const elapsed = s.daySpec.seconds - s.timeLeft;
    const done = [];
    for (const c of mine) done.push(...onDelivery(s, c, elapsed));
    completeContracts(done);
    s.boat.cargo = s.boat.cargo.filter((c) => c.harbor !== harbor.id);
    harbor.pulse = 1;
    audio.deliver();
    burst(harbor.x, harbor.y, harbor.color, 26, 190);
    s.message = mine.some((c) => c.gold) ? 'GOLD DELIVERED! TRIPLE PAY!' : 'DELIVERED!';
    s.messageTime = 1.6;
  }

  function stepPlay(dt, input) {
    const s = game.state;
    stepWind(s.wind, dt, rng);
    stepSea(s.sea, dt, rng, s.daySpec);
    const events = [];
    stepBoat(s.boat, input, s.wind, s.sea, dt, events);
    if (events.some((e) => e.type === 'gust')) {
      audio.gust();
      burst(s.boat.x, s.boat.y, '#7dd3fc', 14, 200);
    }

    // Pickups.
    for (let i = s.sea.crates.length - 1; i >= 0; i -= 1) {
      const c = s.sea.crates[i];
      if (Math.hypot(s.boat.x - c.x, s.boat.y - c.y) < BOAT.pickupRadius + 8 && s.boat.cargo.length < s.boat.carryMax) {
        s.sea.crates.splice(i, 1);
        s.boat.cargo.push(c);
        const h = harborById(s.sea, c.harbor);
        audio.pickup();
        floater(s.boat.x, s.boat.y - 66, (c.gold ? '★ ' : '') + h.letter + ' → ' + h.name, h.color, 17);
        burst(c.x, c.y, h.color, 10, 120);
      }
    }
    // Deliveries.
    for (const h of s.sea.harbors) {
      if (Math.hypot(s.boat.x - h.x, s.boat.y - h.y) < BOAT.harborRadius) deliverAt(h);
    }
    // Rocks.
    for (const r of s.sea.rocks) {
      if (rockHit(s.boat, r)) { rockCrashFX(); break; }
    }
    // Storms: damage over time while inside.
    const storm = stormAt(s.sea.storms, s.boat.x, s.boat.y);
    if (storm) {
      const rate = s.upgradeMods.stormShield ? 0.5 : 1;
      s.boat.hull -= BOAT.stormDamagePerSec * rate * dt;
      completeContracts(onStorm(s, dt));
      if (s.chain > 1 && rng() < dt * 2) s.chain = 1;
      if (rng() < dt * 6) burst(s.boat.x, s.boat.y, '#a78bfa', 3, 90);
      if (s.boat.hull <= 0) { s.boat.hull = 0; endRun(false, 'A storm tore the mailboat apart.'); }
    }

    // Day timer.
    s.timeLeft -= dt;
    if (s.timeLeft <= 0 && s.screen === 'play') {
      s.timeLeft = 0;
      if (s.delivered >= s.daySpec.quota) {
        s.score += SCORE.dayBonus;
        if (s.dayIndex === 2) endRun(true, '');
        else {
          s.offers = offerUpgrades(s.owned.map((u) => u.id), rng);
          s.screen = 'dayclear';
          audio.horn();
        }
      } else {
        endRun(false, `The sun set with ${s.daySpec.quota - s.delivered} crate${s.daySpec.quota - s.delivered === 1 ? '' : 's'} still undelivered.`);
      }
    }

    // Particles and floaters.
    for (const p of s.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    s.particles = s.particles.filter((p) => p.life > 0);
    for (const f of s.floaters) { f.y -= 34 * dt; f.life -= dt; }
    s.floaters = s.floaters.filter((f) => f.life > 0);
    s.messageTime = Math.max(0, s.messageTime - dt);
  }

  function stepDemo(dt, input) {
    // Title-screen backdrop: the sea lives, the boat sails itself, nothing can hurt it.
    const s = game.state;
    stepWind(s.wind, dt, rng);
    stepSea(s.sea, dt, rng, s.daySpec);
    stepBoat(s.boat, input, s.wind, s.sea, dt, []);
    for (const p of s.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    s.particles = s.particles.filter((p) => p.life > 0);
  }

  function applyOffer(offer) {
    const s = game.state;
    s.owned.push(offer);
    offer.apply(s.upgradeMods, s.boat);
    audio.click();
    startDay(s.dayIndex + 1);
  }

  function step(dt, input) {
    const s = game.state;
    s.time += dt;
    if (input.wasPressed('KeyM')) { const m = audio.toggleMute(); s.message = m ? 'SOUND OFF' : 'SOUND ON'; s.messageTime = 1; }
    if (s.screen === 'title') {
      stepDemo(dt, input);
      if (input.wasPressed('Enter') || input.wasPressed('Space') || input.waypoint) {
        audio.unlock();
        audio.click();
        input.clearWaypoint();
        startDay(0);
      }
    } else if (s.screen === 'play') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) { s.screen = 'pause'; audio.click(); }
      else if (input.wasPressed('KeyR')) startDay(s.dayIndex);
      else stepPlay(dt, input);
    } else if (s.screen === 'pause') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape') || input.wasPressed('Enter')) s.screen = 'play';
      else if (input.wasPressed('KeyR')) startDay(s.dayIndex);
    } else if (s.screen === 'dayclear') {
      const n = input.wasPressed('Digit1') ? 0 : input.wasPressed('Digit2') ? 1 : input.wasPressed('Digit3') ? 2 : -1;
      if (n >= 0 && s.offers[n]) applyOffer(s.offers[n]);
      else if (input.waypoint) {
        const m = input.mouse;
        const idx = s.offers.findIndex((u, i) => m.x >= 330 + i * 220 && m.x <= 530 + i * 220 && m.y >= 310 && m.y <= 460);
        input.clearWaypoint();
        if (idx >= 0) applyOffer(s.offers[idx]);
      }
    } else if (s.screen === 'over' || s.screen === 'win') {
      if (input.wasPressed('KeyR') || input.wasPressed('Enter') || input.wasPressed('Space')) {
        audio.click();
        resetRun();
        startDay(0);
      }
    }
    input.endStep();
  }

  function draw() {
    renderer.draw(game.state);
  }

  resetRun();

  return {
    get state() { return game.state; },
    step,
    draw,
    startDay,
    stepDemo,
    resetRun,
    get rng() { return rng; },
  };
}

export function boot(canvas) {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') ?? 7);
  const game = createGame(canvas, seed);
  // Debug handle for automated play-testing (read-only state inspection).
  window.__game = game;
  if (params.has('shot')) {
    // Deterministic screenshot staging: run the sim synchronously, draw once.
    stageShot(params.get('shot'), game);
    game.draw();
    return game;
  }
  const input = createInput(canvas);
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= STEP) { game.step(STEP, input); acc -= STEP; }
    game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return game;
}
