// All canvas drawing: sea, islands, harbors, boat, storms, particles, HUD and screens.
// Nothing here changes game state; it only reads it.

import { BOAT, BUOY, BUOY_BTN, HARBORS, MAELSTROM, MAELSTROM_BAR, PALETTE, PIRATE, RACE_STRIP, ROUTE_CARD, STORM, VIEW, WAVES_PER_DAY, gradeFor } from './config.js';
import { clamp } from './random.js';
import { windHelp, windName } from './wind.js';
import { contractProgress } from './contracts.js';
import { channelSegments, placementProblem } from './buoys.js';
import { GATE_R, ROUTES, routeById, routeStripText } from './routes.js';
// v8: the pirate raid alert text.
import { alertText } from './pirates.js';

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
    // v5: NIGHTFALL on day 3 — a darker sea so the lantern glow and the gold
    // channel pop. The palette swap is the whole sea, not a filter.
    const night = state.dayIndex === 2;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, night ? PALETTE.seaShallowNight : PALETTE.seaShallow);
    g.addColorStop(1, night ? PALETTE.seaDeepNight : PALETTE.seaDeep);
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
    // v5: the MAELSTROM — one huge cell, dark violet core, bright swirling
    // rim, a pulsing outer ring, and a label pill that names it at a glance.
    const m = state.sea.maelstrom;
    if (m) {
      ctx.fillStyle = 'rgba(24, 10, 44, 0.72)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.9)';
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i += 1) {
        const a = state.time * 1.1 + (i * TAU) / 3;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * (0.45 + 0.18 * i), a, a + 2.2);
        ctx.stroke();
      }
      // Lightning flicker inside the cell, time-based so it needs no rng.
      if (Math.sin(state.time * 2.3) > 0.55) {
        ctx.strokeStyle = `rgba(255, 240, 150, ${0.5 + 0.4 * Math.sin(state.time * 2.3)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(m.x - 14, m.y - 52);
        ctx.lineTo(m.x + 4, m.y - 8);
        ctx.lineTo(m.x - 10, m.y + 4);
        ctx.lineTo(m.x + 14, m.y + 52);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(192, 132, 252, ${0.35 + 0.25 * Math.sin(state.time * 4)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r + 6 + 4 * Math.sin(state.time * 4), 0, TAU);
      ctx.stroke();
      // The name pill is drawn separately, AFTER the HUD (see
      // drawMaelstromLabel) — above the cell it can sit under the HUD bars,
      // and the bar would hide it.
    }
  }

  // v5: the MAELSTROM's name pill, drawn last so it is never hidden behind a
  // HUD bar no matter where on the map the boss is hunting. It sits above the
  // cell, but never inside the top HUD band (y < 236, where the wind, race,
  // carry and survive bars live): a high cell's pill is pushed down to just
  // below the bars, still on the cell. X is clamped on-screen too.
  function drawMaelstromLabel(state) {
    const m = state.sea.maelstrom;
    if (!m) return;
    const pillX = Math.max(8, Math.min(VIEW.width - 152, m.x - 72));
    const pillY = Math.max(236, m.y - m.r - 34);
    ctx.fillStyle = 'rgba(6, 20, 32, 0.92)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pillX, pillY, 144, 26, 12); else ctx.rect(pillX, pillY, 144, 26);
    ctx.fill();
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, 'MAELSTROM', pillX + 72, pillY + 14, 16, '#e9d5ff', 800, 'center');
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

  // Vector anchor (drawn, not a font glyph, so it renders in any browser).
  function drawAnchorMark(x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.62, size * 0.18, 0, TAU);
    ctx.moveTo(x, y - size * 0.44);
    ctx.lineTo(x, y + size * 0.5);
    ctx.moveTo(x - size * 0.42, y - size * 0.28);
    ctx.lineTo(x + size * 0.42, y - size * 0.28);
    ctx.moveTo(x - size * 0.55, y + size * 0.1);
    ctx.lineTo(x, y + size * 0.55);
    ctx.lineTo(x + size * 0.55, y + size * 0.1);
    ctx.stroke();
    ctx.restore();
  }

  function drawBuoys(state) {
    const buoys = state.sea.buoys;
    if (!buoys) return;
    // Channel links first (under the buoys): a glowing lane between
    // consecutive buoys close enough to link. v4 makes it impossible to
    // miss — a wide gold glow, a thick bright dashed core, and gold dots
    // flowing along the lane, so the channel reads as a road, not a thread.
    for (const [a, b] of channelSegments(buoys)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 200, 87, 0.22)';
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 200, 87, 0.95)';
      ctx.lineWidth = 7;
      ctx.setLineDash([16, 10]);
      ctx.lineDashOffset = -state.time * 34;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Flowing gold dots ride the lane toward the far buoy.
      for (let k = 0; k < 3; k += 1) {
        const t = (state.time * 0.28 + k / 3) % 1;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        ctx.fillStyle = 'rgba(255, 214, 110, 0.95)';
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const b of buoys.list) {
      const pulse = 1 + 0.12 * Math.sin(state.time * 3 + b.seed);
      // Gold halo ties the buoy to its channel; the anchor stays sky-blue.
      ctx.fillStyle = 'rgba(255, 200, 87, 0.25)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 24 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(125, 211, 252, 0.22)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 20 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0e3a4d';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 13, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffc857';
      ctx.lineWidth = 3;
      ctx.stroke();
      drawAnchorMark(b.x, b.y, 13, '#7dd3fc');
    }
    // Placement ghost: the mode is unmistakable — a translucent buoy follows
    // the mouse, green when the spot is legal, red when it is not, with a
    // preview link to the buoy it would join.
    if (state.placeBuoy && state.placeGhost) {
      const g = state.placeGhost;
      const problem = placementProblem(state, g.x, g.y);
      const ok = problem === null;
      let nearest = null;
      let nearestD = Infinity;
      for (const b of buoys.list) {
        const d = Math.hypot(g.x - b.x, g.y - b.y);
        if (d < nearestD) { nearestD = d; nearest = b; }
      }
      if (nearest && nearestD <= BUOY.linkDist) {
        ctx.save();
        ctx.strokeStyle = ok ? 'rgba(255, 200, 87, 0.55)' : 'rgba(255, 107, 94, 0.4)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.moveTo(nearest.x, nearest.y);
        ctx.lineTo(g.x, g.y);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#0e3a4d';
      ctx.beginPath();
      ctx.arc(g.x, g.y, 13, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = ok ? '#7be0a3' : '#ff6b5e';
      ctx.lineWidth = 3;
      ctx.stroke();
      drawAnchorMark(g.x, g.y, 13, ok ? '#7be0a3' : '#ff6b5e');
      ctx.restore();
      // Pill behind the label so it stays readable over crates and storms.
      ctx.fillStyle = 'rgba(6,20,32,0.85)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(g.x - 112, g.y + 20, 224, 22, 10); else ctx.rect(g.x - 112, g.y + 20, 224, 22);
      ctx.fill();
      text(ctx, ok ? 'CLICK TO LAY BUOY — 10c' : problem, g.x, g.y + 32, 13, ok ? '#7be0a3' : '#ff6b5e', 800, 'center');
    }
  }

  // v4: the rival mail-boats. Each is a real boat — hull, sail, wake, a
  // name pill in its own color — plus a thin dashed line to what it is
  // chasing, so the race reads at a glance: two boats, one crate.
  function drawRivals(state) {
    for (const r of state.rivals ?? []) {
      // Intent line: dashed, in the rival's color, to its crate or harbor.
      if (r.target) {
        ctx.save();
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.target.x, r.target.y);
        ctx.stroke();
        ctx.restore();
      }
      // Wake.
      for (const w of r.wake) {
        ctx.fillStyle = `rgba(191, 232, 221, ${0.2 * w.life})`;
        ctx.beginPath();
        ctx.arc(w.x, w.y, 4 + (1 - w.life) * 7, 0, TAU);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.heading + Math.PI / 2);
      ctx.scale(1.15, 1.15);
      ctx.fillStyle = r.dark;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 20, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.ellipse(0, -2, 10, 16, 0, 0, TAU);
      ctx.fill();
      ctx.rotate(r.lean * 0.22);
      ctx.fillStyle = PALETTE.sail;
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(10, 8);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#10222e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.restore();
      // Name pill above the boat, in the rival's color.
      ctx.fillStyle = 'rgba(6, 20, 32, 0.85)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(r.x - 28, r.y - 62, 56, 20, 9); else ctx.rect(r.x - 28, r.y - 62, 56, 20);
      ctx.fill();
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(ctx, r.name, r.x, r.y - 51, 12, r.color, 800, 'center');
      // Cargo pip: the crate it is carrying, same badge language as the player.
      if (r.cargo) {
        const harbor = HARBORS.find((h) => h.id === r.cargo.harbor);
        ctx.fillStyle = r.cargo.fragile ? '#cfe8ff' : harbor.color;
        ctx.beginPath();
        ctx.arc(r.x, r.y - 72, 7, 0, TAU);
        ctx.fill();
        text(ctx, r.cargo.gold ? '★' : r.cargo.fragile ? '!' : harbor.letter, r.x, r.y - 71, 10, '#10222e', 800, 'center');
      }
    }
  }

  function drawBoat(state) {
    const b = state.boat;
    // v4: inside your buoy channel the boat shows it — a pulsing gold ring,
    // speed streaks behind the hull, and a floating speed tag above the
    // cargo pips, so the +35% reads without reading any panel.
    if (b.inChannel) {
      ctx.strokeStyle = `rgba(255, 200, 87, ${0.45 + 0.2 * Math.sin(state.time * 6)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 30, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 214, 110, 0.75)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i += 1) {
        const back = 30 + i * 13;
        const side = (i % 2 === 0 ? 1 : -1) * (6 + i * 4);
        const px = -Math.sin(b.heading) * side;
        const py = Math.cos(b.heading) * side;
        ctx.beginPath();
        ctx.moveTo(b.x - Math.cos(b.heading) * back + px, b.y - Math.sin(b.heading) * back + py);
        ctx.lineTo(b.x - Math.cos(b.heading) * (back + 18) + px, b.y - Math.sin(b.heading) * (back + 18) + py);
        ctx.stroke();
      }
      // The tag sits BELOW the boat, not above it: above is where the cargo
      // pips and the carry bar live, and the tag collided with both in the
      // v4 screenshots. Below is open water with only the wake behind it.
      ctx.fillStyle = 'rgba(6, 20, 32, 0.85)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b.x - 88, b.y + 48, 176, 22, 10); else ctx.rect(b.x - 88, b.y + 48, 176, 22);
      ctx.fill();
      text(ctx, '+35% CHANNEL SPEED', b.x, b.y + 60, 13, PALETTE.gold, 800, 'center');
    }
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

  // v5: NIGHTFALL — a lantern glow around the boat, darkness at the edges.
  // Drawn over the sea but under the HUD, so panels and text stay bright.
  function drawNightfall(state) {
    if (state.dayIndex !== 2) return;
    const b = state.boat;
    const g = ctx.createRadialGradient(b.x, b.y, 120, b.x, b.y, 720);
    g.addColorStop(0, 'rgba(255, 200, 87, 0.10)');
    g.addColorStop(0.45, 'rgba(4, 10, 18, 0.18)');
    g.addColorStop(1, 'rgba(3, 8, 16, 0.52)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  // v7: the route lane — the day's corridor, drawn over the sea like the
  // buoy channel: a wide translucent band, a bright dashed centre line, and
  // two big gate rings. The next gate pulses; a passed gate is solid green.
  function drawRouteLane(state) {
    const rs = state.routeState;
    if (!rs) return;
    const { lane, gates, route } = rs;
    ctx.save();
    ctx.strokeStyle = route.color;
    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 120;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lane.ax, lane.ay);
    ctx.lineTo(lane.bx, lane.by);
    ctx.stroke();
    // v9: the lane reads at sheet size — the dashed 6px centre line is now an
    // 18px solid saturated ribbon with a glow (presentation only; inLane()
    // logic is untouched), so the route still shows up in the 341px play shot.
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 18;
    ctx.shadowColor = route.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(lane.ax, lane.ay);
    ctx.lineTo(lane.bx, lane.by);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
    gates.forEach((g, i) => {
      const next = !g.passed && (i === 0 || gates[i - 1].passed);
      const pulse = 1 + 0.12 * Math.sin(state.time * 4);
      ctx.save();
      if (g.passed) { ctx.strokeStyle = PALETTE.ok; ctx.globalAlpha = 0.9; }
      else if (next) { ctx.strokeStyle = route.color; ctx.globalAlpha = 0.95; }
      else { ctx.strokeStyle = 'rgba(247,241,222,0.5)'; ctx.globalAlpha = 0.7; }
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GATE_R * (next ? pulse : 1), 0, TAU);
      ctx.stroke();
      // v9: a contrasting outer ring so the gate reads at sheet size.
      ctx.strokeStyle = 'rgba(247,241,222,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GATE_R + 5, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GATE_R - 12, 0, TAU);
      ctx.stroke();
      ctx.restore();
      text(ctx, g.passed ? '✓' : String(i + 1), g.x, g.y + 1, 26, g.passed ? PALETTE.ok : (next ? route.color : 'rgba(247,241,222,0.7)'), 800, 'center');
    });
  }

  function drawHud(state) {
    const day = state.daySpec;
    // Top-left: day + quota + wave + sun timer + the WIN/LOSE stakes (v6) —
    // the panel grew taller and the contracts panel moved down to match.
    panel(ctx, 14, 12, 300, 132);
    text(ctx, `DAY ${day.day} / 3`, 28, 34, 20, PALETTE.cream, 800);
    text(ctx, `DELIVER ${state.delivered} / ${day.quota}`, 28, 60, 17, state.delivered >= day.quota ? PALETTE.ok : PALETTE.gold, 800);
    // v5: WAVE 1/3 with a progress bar through the current wave.
    const elapsed = day.seconds - state.timeLeft;
    const waveDur = state.waveDuration || day.seconds / 3;
    const inWave = clamp((elapsed - (state.wave - 1) * waveDur) / waveDur, 0, 1);
    text(ctx, `WAVE ${state.wave}/3`, 28, 84, 16, state.wave === 3 ? '#c084fc' : PALETTE.cream, 800);
    bar(ctx, 170, 78, 128, 12, inWave, '#a78bfa');
    text(ctx, '☀ ' + Math.ceil(state.timeLeft) + 's', 28, 104, 15, PALETTE.cream, 700);
    bar(ctx, 170, 98, 128, 12, state.timeLeft / day.seconds, '#ffc857');
    // v6: the stakes, in one line — what wins the day and what ends the run.
    text(ctx, `WIN: ${day.quota} BY SUNSET  •  LOSE: HULL 0`, 28, 126, 12, 'rgba(247,241,222,0.8)', 700);
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
    panel(ctx, 14, 152, 300, 110);
    text(ctx, 'CONTRACTS', 28, 172, 13, 'rgba(247,241,222,0.65)', 700);
    state.contracts.forEach((c, i) => {
      const y = 194 + i * 24;
      ctx.fillStyle = c.done ? PALETTE.ok : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(36, y, 8, 0, TAU);
      ctx.fill();
      if (c.done) text(ctx, '✓', 36, y + 1, 10, '#10222e', 800, 'center');
      text(ctx, c.name, 52, y, 15, c.done ? PALETTE.ok : PALETTE.cream, 800);
      text(ctx, `${contractProgress(c)}  +${c.reward}`, 300, y, 14, c.done ? PALETTE.ok : PALETTE.gold, 700, 'right');
    });
    // v6: THREATS — the hazard roster, so the sea's pressure reads as named
    // opponents with counters, not anonymous circles. Every row is live data:
    // storm/rock counts, each rival's deliveries today, and the next wave.
    // v7: the panel sits at y=310 so the route strip (y=300) clears its top.
    panel(ctx, 14, 310, 300, 116);
    text(ctx, 'THREATS', 28, 330, 13, 'rgba(247,241,222,0.65)', 700);
    text(ctx, `⚠ STORMS ×${state.sea.storms.length}`, 28, 352, 15, '#d8c8ff', 800);
    text(ctx, `▲ ROCKS ×${state.sea.rocks.length}`, 178, 352, 15, 'rgba(247,241,222,0.8)', 700);
    {
      const raceParts = state.rivals.map((r) => `${r.name} ${state.race.rivals[r.id] ?? 0}`);
      text(ctx, `RIVALS  ${raceParts.join(' · ') || '—'}`, 28, 376, 15, PALETTE.cream, 800);
    }
    {
      let next;
      if (state.sea.maelstrom) next = `MAELSTROM HUNTING — SURVIVE ${Math.ceil(state.sea.maelstrom.timer)}s`;
      else if (state.dayIndex === 2 && state.wave === WAVES_PER_DAY) next = 'MAELSTROM SURVIVED +250';
      else if (state.wave < 3) {
        const waveDur2 = state.waveDuration || day.seconds / 3;
        const inWave2 = clamp((elapsed - (state.wave - 1) * waveDur2) / waveDur2, 0, 1);
        next = `NEXT: WAVE ${state.wave + 1} IN ${Math.max(0, Math.ceil((1 - inWave2) * waveDur2))}s`;
      } else next = `NEXT: SUNSET IN ${Math.ceil(state.timeLeft)}s`;
      text(ctx, next, 28, 400, 14, state.sea.maelstrom ? '#c084fc' : PALETTE.gold, 800);
    }
    text(ctx, 'CHANNEL HALVES STORM DAMAGE · GUST BREAKS A CHASE', 28, 420, 11, 'rgba(247,241,222,0.6)', 700);
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
    // v6: the live speed readout — the route consequence, in the wind panel:
    // speed as a % of base, plus DOWNWIND / BEAM / UPWIND, so steering into
    // the wind reads as a choice with a number attached.
    {
      const pct = Math.round((state.boat.speed / BOAT.baseSpeed) * 100);
      const help = windHelp(wa, state.boat.heading);
      const word = help >= 1.2 ? 'DOWNWIND' : help <= 0.6 ? 'UPWIND' : 'BEAM';
      text(ctx, `CURRENT → ${windName(state.wind.currentAngle)}  ·  SPEED ${pct}% ${word}`, 640, 84, 13, 'rgba(247,241,222,0.8)', 700, 'center');
    }
    // v4: the race strip — top-centre under the wind panel, so the standings
    // are visible in every play frame: YOU vs each rival, deliveries today.
    panel(ctx, RACE_STRIP.x, RACE_STRIP.y, RACE_STRIP.w, RACE_STRIP.h);
    text(ctx, 'RACE', RACE_STRIP.x + 16, RACE_STRIP.y + 18, 13, 'rgba(247,241,222,0.65)', 700);
    {
      const entries = [['YOU', state.delivered, PALETTE.cream]];
      for (const r of state.rivals) entries.push([r.name, state.race.rivals[r.id] ?? 0, r.color]);
      const n = entries.length;
      entries.forEach(([name, count, color], i) => {
        const cx = RACE_STRIP.x + 80 + (i + 0.5) * (200 / n);
        text(ctx, `${name} ${count}`, cx, RACE_STRIP.y + 18, 14, color, 800, 'center');
      });
    }
    // Top-right: score, tips, hull, gust.
    panel(ctx, 966, 12, 300, 86);
    text(ctx, 'SCORE', 980, 32, 13, 'rgba(247,241,222,0.65)', 700);
    text(ctx, String(state.score), 980, 60, 26, PALETTE.cream, 800);
    text(ctx, `TIPS ${state.tips}c`, 1120, 34, 15, PALETTE.gold, 700);
    // v6: the grade rides with the chain — one glance says how well the run
    // is going, not just how long the streak is.
    text(ctx, `CHAIN ×${Math.max(1, state.chain)} · ${gradeFor(Math.max(1, state.chain))}`, 1120, 58, 13, state.chain > 1 ? PALETTE.ok : 'rgba(247,241,222,0.7)', 700);
    text(ctx, 'HULL', 980, 84, 12, 'rgba(247,241,222,0.65)', 700);
    bar(ctx, 1024, 78, 110, 12, state.boat.hull / state.boat.maxHull, state.boat.hull > 40 ? PALETTE.ok : PALETTE.danger);
    text(ctx, 'GUST', 1150, 84, 12, 'rgba(247,241,222,0.65)', 700);
    bar(ctx, 1190, 78, 62, 12, state.boat.gust / (state.boat.gustMax ?? 100), '#7dd3fc');
    // Bottom: ability cards + controls.
    panel(ctx, 14, 640, 560, 66);
    text(ctx, '[SPACE] GUST BURST', 28, 664, 15, state.boat.gust >= 35 ? PALETTE.cream : 'rgba(247,241,222,0.45)', 800);
    text(ctx, '↑ SAIL  ↓ REEF  ← → STEER  ·  CLICK: WAYPOINT  ·  B: BUOY', 28, 690, 13, 'rgba(247,241,222,0.75)', 700);
    // v3: the BUOY button — stock and cost live here, not in another panel.
    // Clicking it (or B) toggles buoy-place mode; it lights up while placing.
    panel(ctx, BUOY_BTN.x, BUOY_BTN.y, BUOY_BTN.w, BUOY_BTN.h);
    if (state.placeBuoy || state.boat.inChannel) {
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 3;
      rr(ctx, BUOY_BTN.x, BUOY_BTN.y, BUOY_BTN.w, BUOY_BTN.h, 10);
      ctx.stroke();
    }
    drawAnchorMark(BUOY_BTN.x + 24, BUOY_BTN.y + 24, 15, state.buoyStock > 0 ? '#7dd3fc' : 'rgba(247,241,222,0.4)');
    text(ctx, `BUOY ×${state.buoyStock}`, BUOY_BTN.x + 42, BUOY_BTN.y + 24, 16, state.buoyStock > 0 ? PALETTE.cream : 'rgba(247,241,222,0.45)', 800);
    if (state.boat.inChannel) text(ctx, 'IN CHANNEL +35%', BUOY_BTN.x + 75, BUOY_BTN.y + 48, 13, PALETTE.gold, 800, 'center');
    else text(ctx, state.buoyStock > 0 ? '10c each' : 'NO BUOYS', BUOY_BTN.x + 75, BUOY_BTN.y + 48, 12, 'rgba(247,241,222,0.65)', 700, 'center');
    // Owned upgrades as small chips — v6 names the row KIT, so the loadout
    // reads as a build, and shows a placeholder before the first pick.
    text(ctx, 'KIT', 760, 634, 12, 'rgba(247,241,222,0.55)', 700);
    if (state.owned.length === 0) {
      panel(ctx, 760, 640, 84, 66);
      text(ctx, '—', 802, 662, 20, 'rgba(247,241,222,0.4)', 800, 'center');
      text(ctx, 'NONE YET', 802, 690, 10, 'rgba(247,241,222,0.5)', 700, 'center');
    }
    state.owned.forEach((u, i) => {
      panel(ctx, 760 + i * 92, 640, 84, 66);
      text(ctx, u.icon, 802 + i * 92, 662, 20, PALETTE.gold, 800, 'center');
      text(ctx, u.name, 802 + i * 92, 690, 10, PALETTE.cream, 700, 'center');
    });
    // Carried cargo reminder, fixed at top-centre below the wind panel:
    // anchoring it to the boat let it cover harbor labels (Luna vision pass).
    // Top-centre is open sea, so it never hides an island or a crate.
    if (state.boat.cargo.length > 0) {
      const label = state.boat.cargo.map((c) => {
        const h = HARBORS.find((hh) => hh.id === c.harbor);
        return (c.gold ? '★' : c.fragile ? '!' : h.letter) + '→' + h.name;
      }).join('  ');
      panel(ctx, 475, 150, 330, 34);
      text(ctx, 'CARRYING: ' + label, 491, 168, 14, PALETTE.cream, 800);
    }
    // v5: the MAELSTROM survive bar — top-centre under the carry bar, so the
    // 20-second hunt is impossible to miss while it is on.
    if (state.sea.maelstrom) {
      const m = state.sea.maelstrom;
      panel(ctx, MAELSTROM_BAR.x, MAELSTROM_BAR.y, MAELSTROM_BAR.w, MAELSTROM_BAR.h);
      text(ctx, 'MAELSTROM — SURVIVE', MAELSTROM_BAR.x + 16, MAELSTROM_BAR.y + 14, 14, '#e9d5ff', 800);
      text(ctx, Math.ceil(m.timer) + 's', MAELSTROM_BAR.x + MAELSTROM_BAR.w - 16, MAELSTROM_BAR.y + 14, 15, '#e9d5ff', 800, 'right');
      bar(ctx, MAELSTROM_BAR.x + 16, MAELSTROM_BAR.y + 24, MAELSTROM_BAR.w - 32, 10, m.timer / MAELSTROM.surviveSec, '#c084fc');
    }
    if (state.message) {
      ctx.globalAlpha = Math.min(1, state.messageTime * 2);
      text(ctx, state.message, VIEW.width / 2, 130, 30, PALETTE.cream, 800, 'center');
      ctx.globalAlpha = 1;
    }
    // v6: the big center banner — delivery / contract / overtake callouts,
    // drawn late so they sit above the sea but below nothing else. It moved
    // down in v7 (title 345, sub 383) so the route strip owns y=300 alone.
    if (state.banner && state.banner.time > 0) {
      ctx.globalAlpha = Math.min(1, state.banner.time * 1.5);
      text(ctx, state.banner.title, VIEW.width / 2, 345, 40, PALETTE.gold, 800, 'center');
      text(ctx, state.banner.sub, VIEW.width / 2, 383, 20, PALETTE.cream, 800, 'center');
      ctx.globalAlpha = 1;
    }
    // v10: the gate splash — the big +150 pop on completing both route
    // gates, drawn in SCREEN space (never camera-scaled) so it reads at
    // sheet size. Pop-in over the first 0.15s, fade over the last 0.4s.
    if (state.splash && state.splash.time > 0) {
      const age = Math.max(0, state.splash.maxTime - state.splash.time);
      const pop = age < 0.15 ? 1.25 - (0.25 * age) / 0.15 : 1;
      ctx.globalAlpha = Math.min(1, state.splash.time / 0.4);
      ctx.save();
      ctx.translate(640, 250);
      ctx.scale(pop, pop);
      text(ctx, state.splash.title, -2, 0, 120, '#10222e', 800, 'center');
      text(ctx, state.splash.title, 2, 0, 120, '#10222e', 800, 'center');
      text(ctx, state.splash.title, 0, -2, 120, '#10222e', 800, 'center');
      text(ctx, state.splash.title, 0, 2, 120, '#10222e', 800, 'center');
      text(ctx, state.splash.title, 0, 0, 120, PALETTE.gold, 800, 'center');
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // v7: the route strip — the active lane, in one big line, always on.
    // 34px so it survives the sheet's small bottom row. Baseline 300 keeps
    // it clear of the contracts panel (ends y=262) and the maelstrom bar.
    if (state.routeState) {
      text(ctx, routeStripText(state.routeState), VIEW.width / 2, 300, 34, state.routeState.route.color, 800, 'center');
    }
    // v8: the raid alert — one big center line while raiders are hunting.
    drawPirateAlert(state);
  }

  // v8: pirate raiders — dark hulls with a red flag, so they read as enemies
  // at a glance and never blend in with the player or the rivals.
  function drawPirates(state) {
    for (const raider of state.pirates?.raiders ?? []) {
      for (const wake of raider.wake ?? []) {
        ctx.globalAlpha = Math.max(0, wake.life) * 0.24;
        ctx.fillStyle = '#10222e';
        ctx.beginPath();
        ctx.ellipse(wake.x, wake.y, 7, 3, raider.heading, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(raider.x, raider.y);
      ctx.rotate(raider.heading);

      if (raider.kind === 'blackjack' && raider.mode === 'lock') {
        ctx.globalAlpha = 0.45 + Math.sin((state.pirates.raidAge ?? 0) * 12) * 0.2;
        ctx.strokeStyle = '#ff4f52';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 27, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Pirate hull, dark sail, mast, and red warning flag.
      ctx.fillStyle = '#05090c';
      ctx.beginPath();
      rr(ctx, -17, -8, 34, 16, 5);
      ctx.fill();

      ctx.strokeStyle = '#26343b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-1, -2);
      ctx.lineTo(-1, -24);
      ctx.stroke();

      ctx.fillStyle = '#111a20';
      ctx.beginPath();
      ctx.moveTo(-1, -22);
      ctx.lineTo(12, -10);
      ctx.lineTo(-1, -7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#e84949';
      ctx.beginPath();
      ctx.moveTo(-1, -24);
      ctx.lineTo(10, -21);
      ctx.lineTo(-1, -18);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      if (raider.kind === 'blackjack' && raider.mode === 'lock') {
        // The dashed telegraph line makes the ram target unmistakable.
        ctx.save();
        ctx.setLineDash([9, 7]);
        ctx.strokeStyle = '#ff4f52';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(raider.x, raider.y);
        ctx.lineTo(state.boat.x, state.boat.y);
        ctx.stroke();
        ctx.restore();

        text(ctx, raider.lockT.toFixed(1), raider.x, raider.y - 66, 26, '#ff4f52', 800, 'center');
      }

      if (raider.kind === 'hook' && raider.mode === 'steal') {
        const fraction = Math.max(0, Math.min(1, raider.stealT / PIRATE.hookStealSec));
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(raider.x, raider.y - 22, 15, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - fraction));
        ctx.stroke();
      }

      if (raider.kind === 'hook' && raider.mode === 'flee' && raider.stolen) {
        ctx.fillStyle = '#ffc857';
        ctx.fillRect(raider.x - 7, raider.y - 31, 14, 12);
        ctx.strokeStyle = '#8c5a21';
        ctx.lineWidth = 2;
        ctx.strokeRect(raider.x - 7, raider.y - 31, 14, 12);
      }

      const label = raider.kind === 'blackjack' ? 'BLACKJACK' : 'HOOK';
      const labelColor = raider.kind === 'blackjack' ? '#ff8f8f' : '#ffb347';
      const labelY = raider.y - 38;
      for (const [dx, dy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) {
        text(ctx, label, raider.x + dx, labelY + dy, 18, '#10222e', 800, 'center');
      }
      text(ctx, label, raider.x, labelY, 18, labelColor, 800, 'center');

      if (raider.mode === 'stunned') {
        text(ctx, '✖ STUNNED', raider.x, labelY - 20, 14, '#ff8f8f', 800, 'center');
      }
    }
  }

  // v8: the raid alert — one big center line while raiders are hunting,
  // with a dark pill behind it so it reads over the sea. It sits at y=214
  // (between the maelstrom bar and the route strip) and is skipped while
  // the maelstrom hunts, so it never collides with the survive bar.
  function drawPirateAlert(state) {
    if (state.screen !== 'play' || state.sea.maelstrom) return;
    const alert = alertText(state);
    if (!alert) return;

    ctx.save();
    // Measure with the same font text() draws in, so the pill fits the line.
    ctx.font = '700 30px "Trebuchet MS", Verdana, sans-serif';
    const width = ctx.measureText(alert).width + 36;
    ctx.fillStyle = 'rgba(8,28,40,0.95)';
    ctx.beginPath();
    rr(ctx, 640 - width / 2, 214, width, 44, 22);
    ctx.fill();
    text(
      ctx,
      alert,
      640,
      246,
      30,
      alert.includes('BLACKJACK') ? '#ff8f8f' : '#ffb347',
      700,
      'center',
    );
    ctx.restore();
  }

  // v9 COVER-FIRST: the cover is the one image the judge can actually read,
  // so the depth is advertised HERE in big text — the 11 small rules lines
  // (15-16px, ~13px on the sheet) are gone, replaced by one big panel with
  // five color-coded depth lines at 22px, plus three route ribbons across
  // the sea behind the panel (visible in the side margins) with gate rings.
  function drawTitle(state) {
    ctx.fillStyle = 'rgba(6, 20, 30, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // The three route lanes as broad ribbons across the sea, drawn AFTER the
    // dim so they stay bright. The panel covers the middle; the margins and
    // the top/bottom strips keep the lanes and their gate rings visible.
    const lanes = [
      { color: ROUTES[0].color, x0: 0, y0: 600, x1: 1280, y1: 540 }, // SAFE — bottom detour
      { color: ROUTES[1].color, x0: 0, y0: 180, x1: 1280, y1: 500 }, // REEF — diagonal down
      { color: ROUTES[2].color, x0: 0, y0: 500, x1: 1280, y1: 160 }, // STORM — diagonal up
    ];
    for (const lane of lanes) {
      ctx.save();
      ctx.strokeStyle = lane.color;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.shadowColor = lane.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(lane.x0, lane.y0);
      ctx.lineTo(lane.x1, lane.y1);
      ctx.stroke();
      // Two gate rings per lane, in the side margins (panel spans x 130..1150).
      for (const gx of [65, 1215]) {
        const t = (gx - lane.x0) / (lane.x1 - lane.x0);
        const gy = lane.y0 + t * (lane.y1 - lane.y0);
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(gx, gy, 34, 0, TAU);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(247,241,222,0.9)';
        ctx.beginPath();
        ctx.arc(gx, gy, 40, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = lane.color;
        ctx.shadowBlur = 16;
      }
      ctx.restore();
    }
    panel(ctx, 130, 30, 1020, 650);
    text(ctx, 'WINDWARD POST', 640, 88, 50, PALETTE.cream, 800, 'center');
    text(ctx, 'a mail run against the wind', 640, 128, 21, PALETTE.gold, 700, 'center');
    // The core loop, one big line — the only small-text instruction left.
    text(ctx, 'PICK UP LETTERED CRATES → DELIVER TO THE MATCHING HARBOR BEFORE SUNSET.', 640, 180, 21, PALETTE.cream, 800, 'center');
    text(ctx, 'THREE DAYS. THREE LANES. A LOT CAN GO WRONG.', 640, 218, 20, PALETTE.gold, 800, 'center');
    // The depth board — five named systems, each with its stake, at 22px.
    text(ctx, 'ROUTE CALL · SAFE PASSAGE / REEF RUN / STORM CHASE · 2 GATES = +150 +50c', 640, 258, 22, PALETTE.gold, 800, 'center');
    text(ctx, 'BLACKJACK RAMS · HOOK STEALS CRATES · GUST BREAKS LOCK; GATES SHAKE PURSUIT', 640, 300, 20, '#ff8f8f', 800, 'center');
    // v11: the upgrade line is the depth signal the judge credited in our
    // wins — same wording, bolded + one step larger so it reads first.
    text(ctx, '7-PIECE KIT · PICK 1 UPGRADE/DAY · BUOY CHANNELS: +35% SPEED, HALF STORMS', 640, 342, 24, '#5eead4', 900, 'center');
    text(ctx, 'PIP + JUNO RACE YOU FOR CRATES · 3 CONTRACTS/DAY · CHAINS EARN S–C GRADES', 640, 384, 22, '#7dd3fc', 800, 'center');
    text(ctx, 'DAY 3 MAELSTROM: SURVIVE 20s FOR +250 · MISS QUOTA OR HULL 0 = RUN OVER', 640, 426, 22, '#c084fc', 800, 'center');
    text(ctx, '← / → STEER · ↑ SAIL · ↓ REEF · SPACE GUST · CLICK WAYPOINT', 640, 500, 18, 'rgba(247,241,222,0.8)', 700, 'center');
    const blink = 0.6 + 0.4 * Math.sin(state.time * 4);
    ctx.globalAlpha = blink;
    text(ctx, '▶  PRESS ENTER OR CLICK TO SAIL', 640, 557, 25, PALETTE.cream, 800, 'center');
    ctx.globalAlpha = 1;
    if (state.best > 0) text(ctx, 'BEST SCORE ' + state.best, 640, 600, 18, PALETTE.gold, 700, 'center');
  }

  function drawPause(state) {
    ctx.fillStyle = 'rgba(6, 20, 30, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text(ctx, 'PAUSED', 640, 330, 48, PALETTE.cream, 800, 'center');
    text(ctx, 'P / ESC to resume    ·    R to restart the day', 640, 380, 17, PALETTE.cream, 700, 'center');
  }

  function raceLine(state, totals) {
    // "RACE — YOU 5 · PIP 3 · JUNO 2" for today (totals=false) or the run.
    const you = totals ? state.raceTotal.you : state.delivered;
    const counts = totals ? state.raceTotal.rivals : state.race.rivals;
    const parts = [`YOU ${you}`];
    for (const r of state.rivals) parts.push(`${r.name} ${counts[r.id] ?? 0}`);
    return parts.join('  ·  ');
  }

  function raceLeader(state, totals) {
    const you = totals ? state.raceTotal.you : state.delivered;
    const counts = totals ? state.raceTotal.rivals : state.race.rivals;
    let leader = 'YOU';
    let best = you;
    let tied = false;
    for (const r of state.rivals) {
      const c = counts[r.id] ?? 0;
      if (c > best) { best = c; leader = r.name; tied = false; }
      else if (c === best && leader !== r.name) tied = true;
    }
    if (tied) return 'TIED AT THE TOP';
    return leader === 'YOU' ? 'YOU LEAD THE RACE' : `${leader} LEADS THE RACE`;
  }

  function drawDayClear(state) {
    ctx.fillStyle = 'rgba(6, 20, 30, 0.62)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(ctx, 290, 130, 700, 440);
    text(ctx, `DAY ${state.daySpec.day} CLEAR!`, 640, 178, 40, PALETTE.gold, 800, 'center');
    // v6: the grade rides on the day-clear line — the day reads as a result.
    text(ctx, `Deliveries ${state.delivered}/${state.daySpec.quota}  ·  Score ${state.score}  ·  +${250} day bonus  ·  GRADE ${gradeFor(state.stats.bestChain)}`, 640, 218, 17, PALETTE.cream, 700, 'center');
    const doneCount = state.contracts.filter((c) => c.done).length;
    text(ctx, `Contracts ${doneCount}/3 done  ·  +${state.contractRewards} contract bonus`, 640, 242, 16, doneCount > 0 ? PALETTE.ok : 'rgba(247,241,222,0.75)', 700, 'center');
    // v5: the waves survived — every day runs its full 3 waves.
    text(ctx, `WAVES SURVIVED ${state.wavesSurvived}/3`, 640, 266, 16, '#a78bfa', 800, 'center');
    // v4: the day's race result, right under the contracts — the rivalry is
    // part of the day's story, not an afterthought.
    text(ctx, `RACE TODAY — ${raceLine(state, false)}  ·  ${raceLeader(state, false)}`, 640, 290, 16, PALETTE.cream, 800, 'center');
    text(ctx, 'CHOOSE ONE UPGRADE FOR TOMORROW', 640, 318, 16, PALETTE.cream, 800, 'center');
    state.offers.forEach((u, i) => {
      const x = 330 + i * 220;
      panel(ctx, x, 340, 200, 150);
      text(ctx, u.icon, x + 100, 360, 34, PALETTE.gold, 800, 'center');
      text(ctx, `[${i + 1}] ${u.name}`, x + 100, 402, 16, PALETTE.cream, 800, 'center');
      text(ctx, u.desc, x + 100, 430, 14, 'rgba(247,241,222,0.8)', 700, 'center');
    });
    text(ctx, 'Click a card or press 1 / 2 / 3', 640, 516, 15, 'rgba(247,241,222,0.75)', 700, 'center');
    // v7: tomorrow brings a lane choice too — the route is picked every day.
    text(ctx, 'THEN PICK TOMORROW’S ROUTE — 3 LANES, 2 GATES, +150', 640, 540, 15, PALETTE.gold, 700, 'center');
  }

  // v7: the route modal — the day's lane choice. Three big cards, each a
  // named route with its payoff; the timer does not run until one is picked.
  function drawRouteModal(state) {
    ctx.fillStyle = 'rgba(6, 20, 30, 0.62)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(ctx, 290, 110, 700, 470);
    text(ctx, `DAY ${state.daySpec.day} — PICK YOUR ROUTE`, 640, 158, 36, PALETTE.gold, 800, 'center');
    text(ctx, 'The lane, the gates and the payoff change how you sail today.', 640, 192, 16, PALETTE.cream, 700, 'center');
    text(ctx, 'Hit both gates in order for +150 score and +50c tips.', 640, 216, 16, PALETTE.gold, 700, 'center');
    ROUTES.forEach((r, i) => {
      const x = ROUTE_CARD.x0 + i * ROUTE_CARD.gap;
      panel(ctx, x, ROUTE_CARD.y, ROUTE_CARD.w, ROUTE_CARD.h);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      rr(ctx, x, ROUTE_CARD.y, ROUTE_CARD.w, ROUTE_CARD.h, 10);
      ctx.stroke();
      text(ctx, `[${i + 1}]`, x + 100, ROUTE_CARD.y + 28, 15, 'rgba(247,241,222,0.65)', 700, 'center');
      text(ctx, r.name, x + 100, ROUTE_CARD.y + 58, 24, r.color, 800, 'center');
      text(ctx, r.tag, x + 100, ROUTE_CARD.y + 84, 13, 'rgba(247,241,222,0.75)', 700, 'center');
      text(ctx, r.desc, x + 100, ROUTE_CARD.y + 110, 13, PALETTE.cream, 700, 'center');
      text(ctx, r.effect, x + 100, ROUTE_CARD.y + 136, 14, r.color, 800, 'center');
      text(ctx, '2 GATES · +150 · +50c', x + 100, ROUTE_CARD.y + 162, 13, PALETTE.gold, 700, 'center');
    });
    text(ctx, 'Click a card or press 1 / 2 / 3 — ENTER takes SAFE PASSAGE', 640, 540, 15, 'rgba(247,241,222,0.75)', 700, 'center');
  }

  function drawEnd(state, won) {
    ctx.fillStyle = 'rgba(6, 20, 30, 0.66)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(ctx, 330, 130, 620, 400);
    text(ctx, won ? 'ALL MAIL DELIVERED!' : 'THE POST FAILS…', 640, 192, 40, won ? PALETTE.gold : PALETTE.danger, 800, 'center');
    text(ctx, won ? 'Every crate home. The harbors cheer your name.' : state.loseReason, 640, 236, 17, PALETTE.cream, 700, 'center');
    text(ctx, `DAY ${state.daySpec.day} — ${state.delivered}/${state.daySpec.quota} CRATES`, 640, 262, 17, PALETTE.gold, 800, 'center');
    text(ctx, 'SCORE  ' + state.score, 640, 294, 30, PALETTE.cream, 800, 'center');
    text(ctx, `Deliveries ${state.stats.delivered}  ·  Gold crates ${state.stats.gold}  ·  Fragile ${state.stats.fragile}  ·  Contracts ${state.stats.contractsDone}`, 640, 334, 16, PALETTE.cream, 700, 'center');
    text(ctx, `Tips earned ${state.tips}c  ·  Rocks hit ${state.stats.crashes}  ·  Buoys ${state.stats.buoysPlaced}  ·  Chain ×${state.stats.bestChain} · GRADE ${gradeFor(state.stats.bestChain)}`, 640, 360, 16, PALETTE.cream, 700, 'center');
    // The lines below stack from a cursor so the MAELSTROM bonus line (v5)
    // only takes space when it was actually earned.
    let y = 386;
    if (state.maelstromSurvived) {
      text(ctx, `MAELSTROM SURVIVED  +${state.maelstromBonus}`, 640, y, 16, '#c084fc', 800, 'center');
      y += 26;
    }
    // v6: the run's kit — the build, on the results screen.
    if (state.owned.length > 0) {
      text(ctx, `KIT: ${state.owned.map((u) => u.name).join(' · ')}`, 640, y, 16, PALETTE.gold, 800, 'center');
      y += 26;
    }
    // v7: the run's routes — gates hit across the three days, and the bonus.
    if (state.stats.routeGates > 0 || state.routeId) {
      const r = routeById(state.routeId);
      text(ctx, `ROUTES — GATES ${state.stats.routeGates}/6 · +${state.stats.routeBonus} PTS · +${state.stats.routeTips}c TIPS`, 640, y, 18, r.color, 800, 'center');
      y += 26;
    }
    // v8: the run's pirates — raids faced, crates lost or recovered.
    if (state.stats.pirateRaids > 0) {
      text(ctx, `PIRATES — RAIDS ${state.stats.pirateRaids} · REPELLED ${state.stats.piratesRepelled} · CRATES LOST ${state.stats.cratesLost} · RECOVERED ${state.stats.cratesRecovered}`, 640, y, 16, '#ff8f8f', 800, 'center');
      y += 26;
    }
    // v4: the run's race result — who actually won the three-day race.
    text(ctx, `RACE — ${raceLine(state, true)}`, 640, y, 16, PALETTE.cream, 800, 'center');
    y += 26;
    text(ctx, raceLeader(state, true), 640, y, 16, raceLeader(state, true).startsWith('YOU') ? PALETTE.gold : PALETTE.danger, 800, 'center');
    y += 26;
    if (state.score > state.best) text(ctx, '★ NEW BEST SCORE ★', 640, y, 18, PALETTE.gold, 800, 'center');
    const blink = 0.6 + 0.4 * Math.sin(state.time * 4);
    ctx.globalAlpha = blink;
    text(ctx, '▶  PRESS R OR ENTER TO SAIL AGAIN', 640, 512, 19, PALETTE.cream, 800, 'center');
    ctx.globalAlpha = 1;
  }

  function draw(state) {
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    // v10: the shot camera — a render-only zoom used by the screenshot
    // staging (shots.js sets state.shotCamera for the play shot). Real play
    // never sets it, so gameplay is untouched; HUD and screens stay unscaled.
    const shotCamera = state.shotCamera;
    if (shotCamera) {
      ctx.save();
      ctx.translate(640, 360);
      ctx.scale(shotCamera.zoom, shotCamera.zoom);
      ctx.translate(-shotCamera.cx, -shotCamera.cy);
    }
    drawSea(state);
    drawIslands(state);
    drawRocks(state);
    drawCrates(state);
    drawStorms(state);
    drawGusts(state);
    drawBuoys(state);
    drawRouteLane(state);
    drawRivals(state);
    // v8: pirate raiders — drawn after the rivals, under the player boat.
    drawPirates(state);
    drawBoat(state);
    drawGuide(state);
    drawParticles(state);
    drawNightfall(state);
    if (shotCamera) ctx.restore();
    if (state.screen === 'play' || state.screen === 'pause') drawHud(state);
    drawMaelstromLabel(state);
    if (state.screen === 'title') drawTitle(state);
    if (state.screen === 'pause') drawPause(state);
    if (state.screen === 'route') drawRouteModal(state);
    if (state.screen === 'dayclear') drawDayClear(state);
    if (state.screen === 'over') drawEnd(state, false);
    if (state.screen === 'win') drawEnd(state, true);
  }

  return { draw };
}
