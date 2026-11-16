// All canvas drawing: sea, islands, harbors, boat, storms, particles, HUD and screens.
// Nothing here changes game state; it only reads it.

import { BOAT, HARBORS, PALETTE, STORM, VIEW } from './config.js';
import { clamp } from './random.js';
import { windName } from './wind.js';
import { contractProgress } from './contracts.js';

const TAU = Math.PI * 2;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  rr(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelLine;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function text(ctx, str, x, y, size, color, weight = 700, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.14)') {
  ctx.fillStyle = bg;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    rr(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
    ctx.fill();
  }
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawSea(state) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, PALETTE.seaShallow);
    g.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Water streaks flowing with wind and current: the readable wind cue.
    ctx.strokeStyle = 'rgba(191, 232, 221, 0.16)';
    ctx.lineWidth = 2;
    const wx = Math.cos(state.wind.angle);
    const wy = Math.sin(state.wind.angle);
    for (let i = 0; i < 64; i += 1) {
      const sx = ((i * 173.3 + state.time * 26) % 1400) - 60;
      const sy = (i * 97.7) % VIEW.height;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + wx * 34, sy + wy * 34);
      ctx.stroke();
    }
    // Gulls drifting over the water.
    ctx.strokeStyle = 'rgba(247, 241, 222, 0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      const gx = ((i * 211.3 + state.time * (9 + i)) % 1400) - 60;
      const gy = 60 + ((i * 89.1) % 200);
      const flap = Math.sin(state.time * 3 + i * 2) * 3;
      ctx.beginPath();
      ctx.moveTo(gx - 8, gy);
      ctx.quadraticCurveTo(gx - 3, gy - 4 - flap, gx, gy);
      ctx.quadraticCurveTo(gx + 3, gy - 4 - flap, gx + 8, gy);
      ctx.stroke();
    }
    // Sparkles.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let i = 0; i < 26; i += 1) {
      const sx = (i * 211.7 + 40) % VIEW.width;
      const sy = (i * 149.3 + 30) % VIEW.height;
      const tw = 0.5 + 0.5 * Math.sin(state.time * 1.7 + i * 1.3);
      ctx.globalAlpha = 0.08 + 0.2 * tw;
      ctx.fillRect(sx, sy, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  function drawIslands(state) {
    for (const h of state.sea.harbors) {
      // Sand island.
      ctx.fillStyle = PALETTE.sandDark;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 74, 0, TAU);
      ctx.fill();
      ctx.fillStyle = PALETTE.sand;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 66, 0, TAU);
      ctx.fill();
      // Palm-ish tufts.
      ctx.fillStyle = '#3f7d4e';
      ctx.beginPath();
      ctx.arc(h.x - 26, h.y - 30, 9, 0, TAU);
      ctx.arc(h.x + 30, h.y + 24, 8, 0, TAU);
      ctx.fill();
      // Dock planks toward the water.
      ctx.fillStyle = PALETTE.wood;
      ctx.fillRect(h.x - 34, h.y + 58, 68, 12);
      ctx.fillStyle = PALETTE.woodDark;
      for (let i = 0; i < 4; i += 1) ctx.fillRect(h.x - 30 + i * 17, h.y + 58, 2, 12);
      // Harbor flag + letter badge.
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y - 66);
      ctx.lineTo(h.x + 30, h.y - 56);
      ctx.lineTo(h.x, h.y - 46);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#10222e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y - 66);
      ctx.lineTo(h.x, h.y - 18);
      ctx.stroke();
      // Delivery ring: pulses when the boat carries this harbor's crate.
      const carrying = state.boat.cargo.some((c) => c.harbor === h.id);
      ctx.strokeStyle = carrying ? h.color : 'rgba(247, 241, 222, 0.4)';
      ctx.lineWidth = carrying ? 4 : 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 86 + (carrying ? 6 * Math.sin(state.time * 5) : 0), 0, TAU);
      ctx.stroke();
      // Name + letter badge.
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.arc(h.x, h.y - 6, 15, 0, TAU);
      ctx.fill();
      text(ctx, h.letter, h.x, h.y - 5, 19, '#10222e', 800, 'center');
      text(ctx, h.name, h.x, h.y + 96, 13, PALETTE.cream, 800, 'center');
      if (h.pulse > 0) {
        ctx.globalAlpha = h.pulse;
        ctx.strokeStyle = h.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 86 + (1 - h.pulse) * 46, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawRocks(state) {
    for (const r of state.sea.rocks) {
      // Foam ring.
      ctx.strokeStyle = 'rgba(191, 232, 221, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r + 5 + 2 * Math.sin(state.time * 2 + r.seed), 0, TAU);
      ctx.stroke();
      // Rock body.
      ctx.fillStyle = PALETTE.rockDark;
      ctx.beginPath();
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * TAU + r.seed;
        const rr2 = r.r * (0.75 + 0.3 * Math.sin(r.seed * 7 + i * 2.1));
        const px = r.x + Math.cos(a) * rr2;
        const py = r.y + Math.sin(a) * rr2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.rock;
      ctx.beginPath();
      ctx.arc(r.x - r.r * 0.2, r.y - r.r * 0.25, r.r * 0.5, 0, TAU);
      ctx.fill();
    }
  }

  function drawCrates(state) {
    for (const c of state.sea.crates) {
      const bob = Math.sin(c.bob) * 3;
      const harbor = HARBORS.find((h) => h.id === c.harbor);
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      // Shadow on the water.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 10 - bob, 16, 5, 0, 0, TAU);
      ctx.fill();
      // Crate body.
      ctx.fillStyle = c.gold ? '#8a5a33' : c.fragile ? '#7d8ea3' : '#a9743f';
      rr(ctx, -13, -13, 26, 26, 4);
      ctx.fill();
      ctx.strokeStyle = c.gold ? PALETTE.gold : c.fragile ? '#cfe8ff' : harbor.color;
      ctx.lineWidth = 3;
      if (c.fragile) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.lineTo(13, 0);
      ctx.stroke();
      // Letter badge = destination, unmistakable at small size.
      // Gold shows ★, fragile shows ! — each kind reads at a glance.
      ctx.fillStyle = c.fragile ? '#cfe8ff' : harbor.color;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fill();
      text(ctx, c.gold ? '★' : c.fragile ? '!' : harbor.letter, 0, 1, 13, '#10222e', 800, 'center');
      ctx.restore();
    }
  }

  function drawStorms(state) {
    for (const s of state.sea.storms) {
      ctx.fillStyle = 'rgba(30, 22, 48, 0.55)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, STORM.radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        const a = state.time * 0.7 + (i * TAU) / 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, STORM.radius * (0.4 + 0.2 * i), a, a + 1.8);
        ctx.stroke();
      }
      if (s.flicker > 0.4) {
        ctx.strokeStyle = `rgba(255, 240, 150, ${s.flicker})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(s.x - 8, s.y - 26);
        ctx.lineTo(s.x + 2, s.y - 4);
        ctx.lineTo(s.x - 6, s.y + 2);
        ctx.lineTo(s.x + 8, s.y + 26);
        ctx.stroke();
      }
      text(ctx, '⚠ STORM', s.x, s.y - STORM.radius - 12, 12, '#d8c8ff', 800, 'center');
    }
  }

  function drawGusts(state) {
    for (const g of state.wind.gusts) {
      const alpha = Math.min(1, (g.life / g.maxLife) * 1.4);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 * alpha})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        const off = (i - 1) * 26;
        const px = -Math.sin(g.angle) * off;
        const py = Math.cos(g.angle) * off;
        ctx.beginPath();
        ctx.moveTo(g.x + px - Math.cos(g.angle) * 70, g.y + py - Math.sin(g.angle) * 70);
        ctx.lineTo(g.x + px + Math.cos(g.angle) * 70, g.y + py + Math.sin(g.angle) * 70);
        ctx.stroke();
      }
    }
  }

  function drawBoat(state) {
    const b = state.boat;
    // Wake.
    for (const w of b.wake) {
      ctx.fillStyle = `rgba(191, 232, 221, ${0.25 * w.life})`;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 5 + (1 - w.life) * 9, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.heading + Math.PI / 2);
    ctx.scale(1.3, 1.3);
    // Hull.
    ctx.fillStyle = PALETTE.woodDark;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 20, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = PALETTE.wood;
    ctx.beginPath();
    ctx.ellipse(0, -2, 10, 16, 0, 0, TAU);
    ctx.fill();
    // Sail, leaning into the turn.
    ctx.rotate(b.lean * 0.22);
    ctx.fillStyle = PALETTE.sail;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(11, 8);
    ctx.lineTo(-11, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.sailShade;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(11, 8);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#10222e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.restore();
    // Cargo pips above the boat.
    b.cargo.forEach((c, i) => {
      const harbor = HARBORS.find((h) => h.id === c.harbor);
      ctx.fillStyle = c.fragile ? '#cfe8ff' : harbor.color;
      ctx.beginPath();
      ctx.arc(b.x - (b.cargo.length - 1) * 9 + i * 18, b.y - 40, 7, 0, TAU);
      ctx.fill();
      text(ctx, c.gold ? '★' : c.fragile ? '!' : harbor.letter, b.x - (b.cargo.length - 1) * 9 + i * 18, b.y - 39, 10, '#10222e', 800, 'center');
    });
  }

  function drawGuide(state) {
    // Dashed route line from the boat to the harbor its cargo belongs to:
    // the destination is unmistakable even when the frame is shrunk.
    const b = state.boat;
    if (b.cargo.length === 0) return;
    const h = HARBORS.find((hh) => hh.id === b.cargo[0].harbor);
    ctx.save();
    ctx.strokeStyle = h.color;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const a = Math.atan2(h.y - b.y, h.x - b.x);
    ctx.fillStyle = h.color;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(h.x - Math.cos(a - 0.4) * 16, h.y - Math.sin(a - 0.4) * 16);
    ctx.lineTo(h.x - Math.cos(a + 0.4) * 16, h.y - Math.sin(a + 0.4) * 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      text(ctx, f.str, f.x, f.y, f.size, f.color, 800, 'center');
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(state) {
    const day = state.daySpec;
    // Top-left: day + quota + sun timer.
    panel(ctx, 14, 12, 300, 86);
    text(ctx, `DAY ${day.day} / 3`, 28, 34, 20, PALETTE.cream, 800);
    text(ctx, `DELIVER ${state.delivered} / ${day.quota}`, 28, 62, 17, state.delivered >= day.quota ? PALETTE.ok : PALETTE.gold, 800);
    text(ctx, '☀ ' + Math.ceil(state.timeLeft) + 's', 28, 84, 15, PALETTE.cream, 700);
    bar(ctx, 170, 74, 128, 12, state.timeLeft / day.seconds, '#ffc857');
    // Delivery pips.
    for (let i = 0; i < day.quota; i += 1) {
      ctx.fillStyle = i < state.delivered ? PALETTE.gold : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(178 + i * 26, 34, 9, 0, TAU);
      ctx.fill();
      if (i < state.delivered) text(ctx, '✓', 178 + i * 26, 35, 11, '#10222e', 800, 'center');
    }
    // Job board: exactly three contracts, each with progress + reward.
    // This is the panel that makes the loop read as tracked and varied.
    panel(ctx, 14, 106, 300, 110);
    text(ctx, 'CONTRACTS', 28, 126, 13, 'rgba(247,241,222,0.65)', 700);
    state.contracts.forEach((c, i) => {
      const y = 148 + i * 24;
      ctx.fillStyle = c.done ? PALETTE.ok : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(36, y, 8, 0, TAU);
      ctx.fill();
      if (c.done) text(ctx, '✓', 36, y + 1, 10, '#10222e', 800, 'center');
      text(ctx, c.name, 52, y, 15, c.done ? PALETTE.ok : PALETTE.cream, 800);
      text(ctx, `${contractProgress(c)}  +${c.reward}`, 300, y, 14, c.done ? PALETTE.ok : PALETTE.gold, 700, 'right');
    });
    // Top-center: wind + current compass.
    panel(ctx, 490, 12, 300, 86);
    text(ctx, 'WIND', 506, 32, 13, 'rgba(247,241,222,0.65)', 700);
    const wa = state.wind.angle;
    ctx.strokeStyle = PALETTE.cream;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(640, 58);
    ctx.lineTo(640 + Math.cos(wa) * 22, 58 + Math.sin(wa) * 22);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(640 + Math.cos(wa) * 26, 58 + Math.sin(wa) * 26, 5, 0, TAU);
    ctx.fill();
    text(ctx, windName(wa), 690, 58, 18, PALETTE.cream, 800, 'center');
    text(ctx, 'CURRENT → ' + windName(state.wind.currentAngle), 640, 84, 13, 'rgba(247,241,222,0.8)', 700, 'center');
    // Top-right: score, tips, hull, gust.
    panel(ctx, 966, 12, 300, 86);
    text(ctx, 'SCORE', 980, 32, 13, 'rgba(247,241,222,0.65)', 700);
    text(ctx, String(state.score), 980, 60, 26, PALETTE.cream, 800);
    text(ctx, `TIPS ${state.tips}c`, 1120, 34, 15, PALETTE.gold, 700);
    text(ctx, `CHAIN ×${Math.max(1, state.chain)}`, 1120, 58, 15, state.chain > 1 ? PALETTE.ok : 'rgba(247,241,222,0.7)', 700);
    text(ctx, 'HULL', 980, 84, 12, 'rgba(247,241,222,0.65)', 700);
    bar(ctx, 1024, 78, 110, 12, state.boat.hull / state.boat.maxHull, state.boat.hull > 40 ? PALETTE.ok : PALETTE.danger);
    text(ctx, 'GUST', 1150, 84, 12, 'rgba(247,241,222,0.65)', 700);
    bar(ctx, 1190, 78, 62, 12, state.boat.gust / (state.boat.gustMax ?? 100), '#7dd3fc');
    // Bottom: ability cards + controls.
    panel(ctx, 14, 640, 560, 66);
    text(ctx, '[SPACE] GUST BURST', 28, 664, 15, state.boat.gust >= 35 ? PALETTE.cream : 'rgba(247,241,222,0.45)', 800);
    text(ctx, '↑ SAIL  ↓ REEF  ← → STEER  ·  CLICK: WAYPOINT', 28, 690, 13, 'rgba(247,241,222,0.75)', 700);
    // Owned upgrades as small chips.
    state.owned.forEach((u, i) => {
      panel(ctx, 590 + i * 92, 640, 84, 66);
      text(ctx, u.icon, 632 + i * 92, 662, 20, PALETTE.gold, 800, 'center');
      text(ctx, u.name, 632 + i * 92, 690, 10, PALETTE.cream, 700, 'center');
    });
    // Carried cargo reminder, anchored to the boat so it never hides an island.
    if (state.boat.cargo.length > 0) {
      const label = state.boat.cargo.map((c) => {
        const h = HARBORS.find((hh) => hh.id === c.harbor);
        return (c.gold ? '★' : c.fragile ? '!' : h.letter) + '→' + h.name;
      }).join('  ');
      const px = clamp(state.boat.x - 165, 14, VIEW.width - 344);
      const py = clamp(state.boat.y - 108, 222, VIEW.height - 44);
      panel(ctx, px, py, 330, 34);
      text(ctx, 'CARRYING: ' + label, px + 16, py + 18, 14, PALETTE.cream, 800);
    }
    if (state.message) {
      ctx.globalAlpha = Math.min(1, state.messageTime * 2);
      text(ctx, state.message, VIEW.width / 2, 130, 30, PALETTE.cream, 800, 'center');
      ctx.globalAlpha = 1;
    }
  }

  function drawTitle(state) {
    ctx.fillStyle = 'rgba(6, 20, 30, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(ctx, 340, 120, 600, 400);
    text(ctx, 'WINDWARD POST', 640, 195, 52, PALETTE.cream, 800, 'center');
    text(ctx, 'a mail run against the wind', 640, 238, 20, PALETTE.gold, 700, 'center');
    text(ctx, 'Pick up crates at sea. Each crate is marked with a letter —', 640, 288, 16, PALETTE.cream, 700, 'center');
    text(ctx, 'deliver it to the harbor with the same letter before sunset.', 640, 310, 16, PALETTE.cream, 700, 'center');
    text(ctx, 'Sail with the wind to go fast. Dodge rocks and storms.', 640, 332, 16, PALETTE.cream, 700, 'center');
    text(ctx, 'Gold ★ crates pay triple — if you dare fetch them.', 640, 356, 16, PALETTE.gold, 700, 'center');
    text(ctx, 'Fragile ! crates pay double — but shatter if you hit a rock.', 640, 378, 16, '#cfe8ff', 700, 'center');
    text(ctx, 'Each day: 3 contracts — rush, gold, storm, fragile, chain.', 640, 400, 15, PALETTE.cream, 700, 'center');
    text(ctx, '← → STEER    ↑ SAIL    ↓ REEF    SPACE GUST    CLICK WAYPOINT', 640, 434, 14, 'rgba(247,241,222,0.8)', 700, 'center');
    const blink = 0.6 + 0.4 * Math.sin(state.time * 4);
    ctx.globalAlpha = blink;
    text(ctx, '▶  PRESS ENTER OR CLICK TO SAIL', 640, 466, 20, PALETTE.cream, 800, 'center');
    ctx.globalAlpha = 1;
    if (state.best > 0) text(ctx, 'BEST SCORE ' + state.best, 640, 496, 15, PALETTE.gold, 700, 'center');
  }

  function drawPause(state) {
    ctx.fillStyle = 'rgba(6, 20, 30, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text(ctx, 'PAUSED', 640, 330, 48, PALETTE.cream, 800, 'center');
    text(ctx, 'P / ESC to resume    ·    R to restart the day', 640, 380, 17, PALETTE.cream, 700, 'center');
  }

  function drawDayClear(state) {
    ctx.fillStyle = 'rgba(6, 20, 30, 0.62)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(ctx, 290, 130, 700, 420);
    text(ctx, `DAY ${state.daySpec.day} CLEAR!`, 640, 178, 40, PALETTE.gold, 800, 'center');
    text(ctx, `Deliveries ${state.delivered}/${state.daySpec.quota}  ·  Score ${state.score}  ·  +${250} day bonus`, 640, 222, 17, PALETTE.cream, 700, 'center');
    const doneCount = state.contracts.filter((c) => c.done).length;
    text(ctx, `Contracts ${doneCount}/3 done  ·  +${state.contractRewards} contract bonus`, 640, 248, 16, doneCount > 0 ? PALETTE.ok : 'rgba(247,241,222,0.75)', 700, 'center');
    text(ctx, 'CHOOSE ONE UPGRADE FOR TOMORROW', 640, 284, 16, PALETTE.cream, 800, 'center');
    state.offers.forEach((u, i) => {
      const x = 330 + i * 220;
      panel(ctx, x, 310, 200, 150);
      text(ctx, u.icon, x + 100, 330, 34, PALETTE.gold, 800, 'center');
      text(ctx, `[${i + 1}] ${u.name}`, x + 100, 372, 16, PALETTE.cream, 800, 'center');
      text(ctx, u.desc, x + 100, 400, 14, 'rgba(247,241,222,0.8)', 700, 'center');
    });
    text(ctx, 'Click a card or press 1 / 2 / 3', 640, 480, 15, 'rgba(247,241,222,0.75)', 700, 'center');
  }

  function drawEnd(state, won) {
    ctx.fillStyle = 'rgba(6, 20, 30, 0.66)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(ctx, 330, 140, 620, 380);
    text(ctx, won ? 'ALL MAIL DELIVERED!' : 'THE POST FAILS…', 640, 200, 40, won ? PALETTE.gold : PALETTE.danger, 800, 'center');
    text(ctx, won ? 'Every crate home. The harbors cheer your name.' : state.loseReason, 640, 246, 17, PALETTE.cream, 700, 'center');
    text(ctx, `DAY ${state.daySpec.day} — ${state.delivered}/${state.daySpec.quota} CRATES`, 640, 272, 17, PALETTE.gold, 800, 'center');
    text(ctx, 'SCORE  ' + state.score, 640, 306, 30, PALETTE.cream, 800, 'center');
    text(ctx, `Deliveries ${state.stats.delivered}  ·  Gold crates ${state.stats.gold}  ·  Fragile ${state.stats.fragile}  ·  Contracts ${state.stats.contractsDone}`, 640, 348, 16, PALETTE.cream, 700, 'center');
    text(ctx, `Tips earned ${state.tips}c  ·  Rocks hit ${state.stats.crashes}  ·  Best chain ×${state.stats.bestChain}`, 640, 376, 16, PALETTE.cream, 700, 'center');
    if (state.score > state.best) text(ctx, '★ NEW BEST SCORE ★', 640, 406, 18, PALETTE.gold, 800, 'center');
    const blink = 0.6 + 0.4 * Math.sin(state.time * 4);
    ctx.globalAlpha = blink;
    text(ctx, '▶  PRESS R OR ENTER TO SAIL AGAIN', 640, 452, 19, PALETTE.cream, 800, 'center');
    ctx.globalAlpha = 1;
  }

  function draw(state) {
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    drawSea(state);
    drawIslands(state);
    drawRocks(state);
    drawCrates(state);
    drawStorms(state);
    drawGusts(state);
    drawBoat(state);
    drawGuide(state);
    drawParticles(state);
    if (state.screen === 'play' || state.screen === 'pause') drawHud(state);
    if (state.screen === 'title') drawTitle(state);
    if (state.screen === 'pause') drawPause(state);
    if (state.screen === 'dayclear') drawDayClear(state);
    if (state.screen === 'over') drawEnd(state, false);
    if (state.screen === 'win') drawEnd(state, true);
  }

  return { draw };
}
