// WINDWARD POST — game loop, screens and rules.
// Owns the state; render.js only draws it, boat.js/sea.js/wind.js only step it.

import { BOAT, BUOY, BUOY_BTN, DAYS, GUST, MAELSTROM, ROUTE_CARD, SCORE, VIEW, WAVES_PER_DAY, gradeFor } from './config.js';
import { clamp, makeRng } from './random.js';
import { createAudio } from './audio.js';
import { createBoat, rockHit, stepBoat } from './boat.js';
import { createRenderer } from './render.js';
import { createSea, harborById, spawnCrate, spawnWaveStorm, stepSea } from './sea.js';
import { createInput } from './input.js';
import { createWind, stepWind, stormAt } from './wind.js';
import { offerUpgrades } from './upgrades.js';
import { buildContracts, forceCompleteMaelstrom, onDelivery, onMaelstrom, onRock, onStorm } from './contracts.js';
import { inChannel, placeBuoy as layBuoy, placementProblem } from './buoys.js';
import { createRivals, stepRivals } from './rivals.js';
import { spawnMaelstrom, stepMaelstrom } from './maelstrom.js';
import { buildRoute, GATE_PASS_R, inLane, ROUTE_REWARD, ROUTE_TIPS, routeSpeedMod, routeStormMod, ROUTES } from './routes.js';
// v8: the pirate raid — BLACKJACK rams, HOOK steals crates.
import { clearPirates, createPirateSystem, onPlayerGust, onRouteGate, startRaid, stepPirates } from './pirates.js';
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
      // v8: the seeded rng on the state — pirates.js spawns from it, so the
      // raid is reproducible from the seed like the rest of the sea. (Before
      // this, spawnSpot fell back to Math.random and the end shot varied run
      // to run: hull 84/94/61 for the same seed.)
      rng,
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
      // v6: the big center banner — the delivery/contract/overtake callout
      // render.js draws while banner.time > 0 ({title, sub, time}).
      banner: null,
      // v10: the gate splash — the big +150 pop on completing both route
      // gates (render.js draws while splash.time > 0).
      splash: null,
      raceLeader: '',
      particles: [],
      floaters: [],
      contracts: [],
      contractRewards: 0,
      chainStreak: 0,
      buoyStock: BUOY.stockPerDay,
      placeBuoy: false,
      placeGhost: null,
      // v5: storm waves (3 per day) and the day-3 boss hunt. maelstromSurvived
      // and maelstromBonus are run-level — the boss only ever hunts on day 3.
      wave: 1,
      waveDuration: 0,
      wavesSurvived: 0,
      maelstromSurvived: false,
      maelstromBonus: 0,
      stats: { delivered: 0, gold: 0, fragile: 0, contractsDone: 0, crashes: 0, bestChain: 1, buoysPlaced: 0, routeGates: 0, routeBonus: 0, routeTips: 0, pirateRaids: 0, pirateRams: 0, piratesRepelled: 0, cratesRecovered: 0, cratesLost: 0 },
      // v7: ROUTE CALL — the day's chosen lane. routeId is the pick for this
      // day; routeState is the built lane + gates (null until picked).
      routeId: null,
      routeState: null,
      // v8: the pirate raid system for this day (null until startDay builds it).
      pirates: null,
      // v4: the race — per-day rival deliveries (reset each day) and run
      // totals (shown on the win screen). state.delivered is the player's
      // per-day count, so race.you is not stored twice.
      rivals: [],
      race: { rivals: {} },
      raceTotal: { you: 0, rivals: {} },
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
    s.contracts = buildContracts(rng, dayIndex);
    s.contractRewards = 0;
    s.chainStreak = 0;
    // v5: the day runs in 3 waves; wave 1's storms are the ones createSea laid.
    s.wave = 1;
    s.waveDuration = s.daySpec.seconds / WAVES_PER_DAY;
    s.wavesSurvived = 0;
    s.wind.veer = s.daySpec.veer;
    s.sea = createSea(rng, s.daySpec);
    // v4: fresh rivals each day — one on day 1, two from day 2 — and a fresh
    // race board. Run totals carry across days for the win screen.
    s.rivals = createRivals(rng, s.sea, s.daySpec);
    s.race = { rivals: {} };
    for (const r of s.rivals) s.race.rivals[r.id] = 0;
    const keep = { ...s.upgradeMods };
    // v3: fresh buoy stock each day (plus any BUOY KIT bonus); yesterday's
    // channel is gone with the old sea — every day plans its own route.
    s.buoyStock = BUOY.stockPerDay + (keep.buoyBonus ?? 0);
    s.placeBuoy = false;
    s.placeGhost = null;
    s.boat = createBoat(keep);
    s.boat.gustMax = keep.gustMax ?? GUST.max;
    s.boat.gust = s.boat.gustMax;
    // v7: the day starts at the route modal — the timer does not run until a
    // lane is picked. chooseRoute() builds the lane and starts play.
    s.routeId = null;
    s.routeState = null;
    // v8: fresh pirate raid system for the day (no raid until wave 2).
    s.pirates = createPirateSystem();
    s.screen = 'route';
    s.banner = null;
    s.splash = null;
    s.raceLeader = '';
    s.message = `DAY ${dayIndex + 1} — DELIVER ${s.daySpec.quota} CRATES BEFORE SUNSET`;
    s.messageTime = 3;
  }

  // v7: lock in a route for the day — build its lane and gates, then play.
  // Staging calls this directly (shots.js), so a staged lane is a real lane.
  function chooseRoute(routeId) {
    const s = game.state;
    if (s.screen !== 'route') return;
    s.routeState = buildRoute(s.sea, routeId);
    s.routeId = s.routeState.route.id;
    s.screen = 'play';
    s.message = `${s.routeState.route.name} — SAIL ITS 2 GATES FOR +${ROUTE_REWARD}`;
    s.messageTime = 2.5;
    audio.click();
  }

  // Restart the day on the same route — no modal, the pick already stands.
  function restartDay() {
    const s = game.state;
    const keep = s.routeId;
    startDay(s.dayIndex);
    if (keep) chooseRoute(keep);
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
    let bonus = 0;
    for (const c of done) {
      s.score += c.reward;
      bonus += c.reward;
      floater(s.boat.x, s.boat.y - 66, `CONTRACT ${c.name} +${c.reward}`, '#ffc857', 20);
      s.message = `CONTRACT DONE — ${c.name} +${c.reward}`;
      s.messageTime = 2;
    }
    if (done.length > 0) {
      audio.gold();
      // v6: the contract callout — overwritten by the delivery banner when a
      // delivery completes the contract in the same tick (deliverAt sets its
      // banner after this returns).
      s.banner = { title: `CONTRACT DONE — ${done[0].name} +${bonus}`, sub: `${done.length} CONTRACT${done.length === 1 ? '' : 'S'} COMPLETE`, time: 1.6 };
    }
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
    // v8: the raid ends with the run — no raiders on the end screen.
    clearPirates(s);
    s.loseReason = reason;
    s.screen = won ? 'win' : 'over';
    if (s.score > s.best) { s.best = s.score; saveBest(s.score); }
    if (won) audio.win(); else audio.lose();
  }

  function deliverAt(harbor) {
    const s = game.state;
    const mine = s.boat.cargo.filter((c) => c.harbor === harbor.id);
    if (mine.length === 0) return;
    let gainedTotal = 0;
    for (const c of mine) {
      const base = c.gold ? SCORE.goldDelivery : c.fragile ? SCORE.fragileDelivery : SCORE.delivery;
      const gained = base + SCORE.chainStep * (s.chain - 1);
      gainedTotal += gained;
      s.score += gained;
      s.tips += c.gold ? SCORE.tipGold : c.fragile ? SCORE.tipFragile : SCORE.tipNormal;
      s.stats.delivered += 1;
      if (c.gold) s.stats.gold += 1;
      if (c.fragile) s.stats.fragile += 1;
      floater(harbor.x, harbor.y - 90, `+${gained}`, c.gold ? '#ffc857' : c.fragile ? '#cfe8ff' : '#7be0a3', 24);
      if (c.gold) audio.gold();
    }
    s.delivered += mine.length;
    s.raceTotal.you += mine.length;
    s.chainStreak += mine.length;
    s.stats.bestChain = Math.max(s.stats.bestChain, s.chain);
    s.chain += 1;
    // Contract hooks: rush / gold / fragile / chain progress from these crates.
    const elapsed = s.daySpec.seconds - s.timeLeft;
    const done = [];
    for (const c of mine) done.push(...onDelivery(s, c, elapsed));
    const contractBonus = done.reduce((a, c) => a + c.reward, 0);
    completeContracts(done);
    // v6: the delivery banner — the big callout, with the chain, the grade
    // and the contract bonus folded in, so one delivery reads as a result.
    s.banner = {
      title: `${mine.some((c) => c.gold) ? '★ GOLD DELIVERED! ' : ''}DELIVERED! +${gainedTotal}`,
      sub: `CHAIN ×${s.chain} • GRADE ${gradeFor(s.chain)} • +${s.tips}c TIPS${contractBonus > 0 ? ` • CONTRACT +${contractBonus}` : ''}`,
      time: 1.8,
    };
    // v6: the last delivery's numbers, so a staged screenshot can re-show
    // the banner from a real delivery (shots.js), instead of inventing one.
    s.lastDelivery = { gained: gainedTotal, chain: s.chain, tips: s.tips, contractBonus };
    s.boat.cargo = s.boat.cargo.filter((c) => c.harbor !== harbor.id);
    harbor.pulse = 1;
    audio.deliver();
    burst(harbor.x, harbor.y, harbor.color, 26, 190);
    s.message = mine.some((c) => c.gold) ? 'GOLD DELIVERED! TRIPLE PAY!' : 'DELIVERED!';
    s.messageTime = 1.6;
  }

  function stepPlay(dt, input) {
    const s = game.state;
    // v3: buoy placement mode. B or the BUOY button toggles it; while it is on,
    // a map click lays a buoy instead of steering, and the ghost follows the
    // mouse so the mode is unmistakable. Stock running out exits the mode.
    if (input.wasPressed('KeyB')) {
      s.placeBuoy = !s.placeBuoy;
      s.message = s.placeBuoy ? 'BUOY MODE — CLICK THE WATER TO LAY A BUOY' : 'BUOY MODE OFF';
      s.messageTime = 1.6;
      audio.click();
    }
    if (s.placeBuoy) s.placeGhost = { ...input.mouse };
    if (input.waypoint) {
      const m = input.mouse;
      if (m.x >= BUOY_BTN.x && m.x <= BUOY_BTN.x + BUOY_BTN.w && m.y >= BUOY_BTN.y && m.y <= BUOY_BTN.y + BUOY_BTN.h) {
        s.placeBuoy = !s.placeBuoy;
        s.message = s.placeBuoy ? 'BUOY MODE — CLICK THE WATER TO LAY A BUOY' : 'BUOY MODE OFF';
        s.messageTime = 1.6;
        audio.click();
        input.clearWaypoint();
      } else if (s.placeBuoy) {
        const res = layBuoy(s, input.waypoint.x, input.waypoint.y);
        if (res.ok) {
          completeContracts(res.done);
          audio.pickup();
          s.message = `BUOY LAID — ${s.buoyStock} LEFT TODAY`;
          s.messageTime = 1.4;
          if (s.buoyStock <= 0) s.placeBuoy = false;
        } else {
          s.message = res.reason;
          s.messageTime = 1.6;
        }
        input.clearWaypoint();
      }
    }
    stepWind(s.wind, dt, rng);
    stepSea(s.sea, dt, rng, s.daySpec);
    // v5: storm waves — the day is split in 3, and every new wave brings
    // another, faster storm. Day 3's final wave wakes the MAELSTROM.
    {
      const elapsed = s.daySpec.seconds - s.timeLeft;
      const targetWave = Math.min(WAVES_PER_DAY, Math.floor(elapsed / s.waveDuration) + 1);
      while (s.wave < targetWave) {
        s.wave += 1;
        spawnWaveStorm(s.sea, rng, s.daySpec, s.wave);
        if (s.dayIndex === 2 && s.wave === WAVES_PER_DAY) {
          spawnMaelstrom(s.sea, rng, s.boat);
          s.message = 'WAVE 3 — THE MAELSTROM WAKES!';
        } else {
          s.message = `WAVE ${s.wave} INCOMING — STORMS RISING`;
        }
        s.messageTime = 3;
        audio.horn();
        // v8: wave 2 brings the pirate raid — BLACKJACK (and HOOK from day 2).
        // Inside the loop: a clock jump can cross two waves in one tick, and
        // the raid must still fire when wave 2 is crossed.
        if (s.wave === 2) startRaid(s);
      }
    }
    const events = [];
    // v7: the route lane's speed and position, read before the boat steps.
    s.boat.inLane = inLane(s.routeState, s.boat.x, s.boat.y);
    s.boat.routeSpeed = routeSpeedMod(s.routeState, s.boat, s.sea);
    stepBoat(s.boat, input, s.wind, s.sea, dt, events);
    // v4: rivals step after the player, so the player wins a same-tick race
    // to a crate. A rival banking a crate can complete contracts (OUTRACE
    // shrinks) — score those through the same path as player contracts.
    const rivalDone = stepRivals(s, dt, {
      floater: (x, y, str, color, size) => floater(x, y, str, color, size),
      burst: (x, y, color, n, speed) => burst(x, y, color, n, speed),
    });
    if (rivalDone.length > 0) completeContracts(rivalDone);
    // v8: the pirate raid steps after the rivals, so a raider can steal a
    // crate the same tick a rival banks one. A ram that sinks the boat ends
    // the run (same style as the storm-damage checks below).
    const pirateSunk = stepPirates(s, dt, {
      floater: (x, y, str, color, size) => floater(x, y, str, color, size),
      burst: (x, y, color, n, speed) => burst(x, y, color, n, speed),
    });
    if (pirateSunk) endRun(false, pirateSunk);
    // v6: the overtake callout — the race leader flipping to YOU is a
    // moment, so it gets a banner the same way a delivery does.
    {
      let leader = 'YOU';
      let best = s.delivered;
      for (const r of s.rivals) {
        const c = s.race.rivals[r.id] ?? 0;
        if (c > best) { best = c; leader = r.name; }
      }
      if (leader === 'YOU' && s.raceLeader && s.raceLeader !== 'YOU') {
        s.banner = { title: `YOU PASS ${s.raceLeader}!`, sub: `RACE — YOU ${s.delivered} • ${s.raceLeader} ${best}`, time: 1.6 };
      }
      s.raceLeader = leader;
    }
    if (events.some((e) => e.type === 'gust')) {
      audio.gust();
      // v8: a gust within range stuns the raiders and breaks their attack.
      onPlayerGust(s);
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
    // Storms: damage over time while inside. The channel shelters the boat:
    // storm damage is halved while the boat sails inside its own buoys.
    const storm = stormAt(s.sea.storms, s.boat.x, s.boat.y);
    if (storm) {
      let rate = s.upgradeMods.stormShield ? 0.5 : 1;
      if (s.boat.inChannel) rate *= BUOY.stormShelter;
      // v7: the route lane changes storm risk — safe halves it, storm doubles it.
      rate *= routeStormMod(s.routeState, s.boat);
      s.boat.hull -= BOAT.stormDamagePerSec * rate * dt;
      completeContracts(onStorm(s, dt));
      if (s.chain > 1 && rng() < dt * 2) s.chain = 1;
      if (rng() < dt * 6) burst(s.boat.x, s.boat.y, '#a78bfa', 3, 90);
      if (s.boat.hull <= 0) { s.boat.hull = 0; endRun(false, 'A storm tore the mailboat apart.'); }
    }

    // v7: route gates — sail through the next gate in order. Both gates pay.
    if (s.routeState && !s.routeState.done) {
      const next = s.routeState.gates.find((g) => !g.passed);
      if (next && Math.hypot(s.boat.x - next.x, s.boat.y - next.y) < GATE_PASS_R) {
        next.passed = true;
        // v8: a gate pass shakes off a raider's pursuit (once per raider).
        onRouteGate(s);
        s.stats.routeGates += 1;
        const passed = s.routeState.gates.filter((g) => g.passed).length;
        audio.pickup();
        floater(next.x, next.y - 56, `GATE ${passed}/2`, s.routeState.route.color, 24);
        if (passed === 2) {
          s.routeState.done = true;
          s.score += ROUTE_REWARD;
          s.tips += ROUTE_TIPS;
          s.stats.routeBonus += ROUTE_REWARD;
          s.stats.routeTips += ROUTE_TIPS;
          // v10: completing both gates fires the big +150 splash instead of
          // the 40px banner — the reward pop has to read at sheet size.
          s.splash = {
            title: '+150',
            time: 1.4,
            maxTime: 1.4,
          };
          audio.gold();
        } else {
          s.message = `${s.routeState.route.name} — GATE ${passed}/2`;
          s.messageTime = 1.6;
        }
      }
    }

    // v5: the MAELSTROM hunt — it chases the boat, hurts more than a normal
    // storm, and the channel halves its damage too. Outlast its 20s and the
    // sea calms for +250; the SURVIVE contract tracks the same 20s.
    const m = s.sea.maelstrom;
    if (m && s.screen === 'play') {
      stepMaelstrom(m, s.boat, dt);
      completeContracts(onMaelstrom(s, dt));
      if (Math.hypot(s.boat.x - m.x, s.boat.y - m.y) < m.r) {
        let rate = s.upgradeMods.stormShield ? 0.5 : 1;
        if (s.boat.inChannel) rate *= BUOY.stormShelter;
        rate *= routeStormMod(s.routeState, s.boat);
        s.boat.hull -= MAELSTROM.damagePerSec * rate * dt;
        if (rng() < dt * 6) burst(s.boat.x, s.boat.y, '#c084fc', 3, 90);
        if (s.boat.hull <= 0) { s.boat.hull = 0; endRun(false, 'The Maelstrom swallowed the mailboat.'); }
      }
      if (m.timer <= 0 && s.screen === 'play') {
        s.maelstromSurvived = true;
        s.maelstromBonus = MAELSTROM.bonus;
        s.sea.maelstrom = null;
        burst(m.x, m.y, '#c084fc', 30, 220);
        floater(s.boat.x, s.boat.y - 66, 'MAELSTROM OUTLASTED!', '#c084fc', 22);
        s.message = 'MAELSTROM OUTLASTED — THE SEA CALMS';
        s.messageTime = 2.5;
        audio.win();
      }
    }

    // Day timer.
    s.timeLeft -= dt;
    if (s.timeLeft <= 0 && s.screen === 'play') {
      s.timeLeft = 0;
      s.wavesSurvived = s.wave;
      if (s.delivered >= s.daySpec.quota) {
        // v5: the day is won while the Maelstrom still hunts — if it hunted
        // for a real stretch, that counts as surviving it.
        const mm = s.sea.maelstrom;
        if (mm && mm.age > 5 && !s.maelstromSurvived) {
          const f = forceCompleteMaelstrom(s);
          if (f) {
            s.score += f.reward;
            s.maelstromSurvived = true;
            s.maelstromBonus = f.reward;
          }
          s.sea.maelstrom = null;
        }
        s.score += SCORE.dayBonus;
        if (s.dayIndex === 2) endRun(true, '');
        else {
          // v8: the raid ends with the day — no raiders on the upgrade screen.
          clearPirates(s);
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
    // v6: the banner fades out on its own clock.
    if (s.banner) {
      s.banner.time -= dt;
      if (s.banner.time <= 0) s.banner = null;
    }
    // v10: the gate splash fades on its own clock, next to the banner.
    if (s.splash) {
      s.splash.time -= dt;
      if (s.splash.time <= 0) s.splash = null;
    }
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
    } else if (s.screen === 'route') {
      // v7: pick the day's lane — keys, click, or ENTER for the safe default.
      const n = input.wasPressed('Digit1') ? 0 : input.wasPressed('Digit2') ? 1 : input.wasPressed('Digit3') ? 2 : -1;
      if (n >= 0) chooseRoute(ROUTES[n].id);
      else if (input.wasPressed('Enter')) chooseRoute('safe');
      else if (input.waypoint) {
        const m = input.mouse;
        const idx = ROUTES.findIndex((r, i) => m.x >= ROUTE_CARD.x0 + i * ROUTE_CARD.gap && m.x <= ROUTE_CARD.x0 + i * ROUTE_CARD.gap + ROUTE_CARD.w && m.y >= ROUTE_CARD.y && m.y <= ROUTE_CARD.y + ROUTE_CARD.h);
        input.clearWaypoint();
        if (idx >= 0) chooseRoute(ROUTES[idx].id);
      }
    } else if (s.screen === 'play') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) { s.screen = 'pause'; audio.click(); }
      else if (input.wasPressed('KeyR')) restartDay();
      else stepPlay(dt, input);
    } else if (s.screen === 'pause') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape') || input.wasPressed('Enter')) s.screen = 'play';
      else if (input.wasPressed('KeyR')) restartDay();
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
    // Shared placement entry point: the click path, the autopilot probe and the
    // screenshot staging all lay buoys through this, so a staged buoy is real.
    placeBuoy(x, y) {
      const res = layBuoy(game.state, x, y);
      if (res.ok) completeContracts(res.done);
      return res;
    },
    // v7: staging picks the route directly (shots.js) — a staged lane is real.
    chooseRoute(id) { chooseRoute(id); },
    placementProblem(x, y) { return placementProblem(game.state, x, y); },
    inChannel(x, y) { return inChannel(game.state.sea.buoys, x, y); },
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
