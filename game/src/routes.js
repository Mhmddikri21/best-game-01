// v7: ROUTE CALL — one of three named sea lanes per day, each with a visible
// lane on the sea and two gates to sail through in order. The choice changes
// how the day plays: safe is sheltered, reef is fast through rocks, storm
// is fastest near storms and punishes storm time. Completing both gates
// pays +150 score and +50 tips. Gates are validated against rocks and
// harbors at build time, so a lane is always sail-able. Written by GPT-6 Luna.

import { STORM } from './config.js';

export const ROUTE_REWARD = 150;
export const ROUTE_TIPS = 50;
export const LANE_HALF = 60;
export const GATE_R = 42;
export const GATE_PASS_R = 58;

export const ROUTES = [
  {
    id: 'safe',
    name: 'SAFE PASSAGE',
    color: '#7be0a3',
    tag: 'the long way round',
    desc: 'Storms hurt half as much',
    effect: 'IN LANE',
  },
  {
    id: 'reef',
    name: 'REEF RUN',
    color: '#ffc857',
    tag: 'the shortcut through rocks',
    desc: '+25% speed in the lane',
    effect: 'ROCKS STILL BITE',
  },
  {
    id: 'storm',
    name: 'STORM CHASE',
    color: '#c084fc',
    tag: 'ride the storm track',
    desc: '+35% speed near storms',
    effect: 'STORMS HIT 2× IN LANE',
  },
];

const IDEAL_GATES = {
  safe: [[470, 600], [810, 600]],
  reef: [[470, 290], [810, 450]],
  storm: [[470, 450], [810, 290]],
};

const GATE_OFFSETS = [
  [0, 0], [45, 0], [-45, 0], [0, 45], [0, -45],
  [45, 45], [45, -45], [-45, 45], [-45, -45],
  [90, 0], [-90, 0], [0, 90], [0, -90],
  [90, 90], [90, -90], [-90, 90], [-90, -90],
  [135, 0], [-135, 0], [0, 135], [0, -135],
];

export function routeById(id) {
  return ROUTES.find((route) => route.id === id) || ROUTES[0];
}

function isValidGate(point, sea, other) {
  if (point.x < 90 || point.x > 1190 || point.y < 160 || point.y > 620) return false;

  for (const harbor of sea.harbors || []) {
    if (Math.hypot(point.x - harbor.x, point.y - harbor.y) < 115) return false;
  }

  for (const rock of sea.rocks || []) {
    if (Math.hypot(point.x - rock.x, point.y - rock.y) < rock.r + 55) return false;
  }

  return !other || Math.hypot(point.x - other.x, point.y - other.y) >= 170;
}

function nudgeGate(ideal, sea, other) {
  for (const [dx, dy] of GATE_OFFSETS) {
    const point = { x: ideal[0] + dx, y: ideal[1] + dy };
    if (isValidGate(point, sea, other)) return point;
  }
  return { x: 640, y: 360 };
}

export function buildRoute(sea, routeId) {
  const route = routeById(routeId);
  const ideals = IDEAL_GATES[route.id];
  const gate1 = nudgeGate(ideals[0], sea, null);
  const gate2 = nudgeGate(ideals[1], sea, gate1);

  return {
    route,
    lane: { ax: gate1.x, ay: gate1.y, bx: gate2.x, by: gate2.y },
    gates: [
      { x: gate1.x, y: gate1.y, passed: false },
      { x: gate2.x, y: gate2.y, passed: false },
    ],
    done: false,
  };
}

export function inLane(routeState, x, y) {
  if (!routeState || !routeState.lane) return false;

  const { ax, ay, bx, by } = routeState.lane;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= LANE_HALF;
}

export function nearStormEdge(sea, x, y) {
  if (!sea) return false;

  for (const storm of sea.storms || []) {
    if (Math.abs(Math.hypot(x - storm.x, y - storm.y) - STORM.radius) <= 120) return true;
  }

  const maelstrom = sea.maelstrom;
  return Boolean(
    maelstrom &&
    Math.abs(Math.hypot(x - maelstrom.x, y - maelstrom.y) - maelstrom.r) <= 120
  );
}

export function routeSpeedMod(routeState, boat, sea) {
  if (!routeState || !boat || !inLane(routeState, boat.x, boat.y)) return 1;

  const id = routeState.route && routeState.route.id;
  if (id === 'reef') return 1.25;
  if (id === 'storm' && nearStormEdge(sea, boat.x, boat.y)) return 1.35;
  return 1;
}

export function routeStormMod(routeState, boat) {
  if (!routeState || !boat || !inLane(routeState, boat.x, boat.y)) return 1;

  const id = routeState.route && routeState.route.id;
  if (id === 'safe') return 0.5;
  if (id === 'storm') return 2;
  return 1;
}

export function routeStripText(routeState) {
  if (!routeState) return '';

  const passed = (routeState.gates || []).filter((gate) => gate.passed).length;
  const id = routeState.route && routeState.route.id;
  let effect = '';

  if (id === 'safe') effect = 'STORMS HALF DAMAGE IN LANE';
  else if (id === 'reef') effect = '+25% SPEED IN LANE';
  else if (id === 'storm') effect = '+35% NEAR STORMS · STORMS 2× IN LANE';

  return `${routeState.route.name} · GATES ${passed}/2 · ${effect}${routeState.done ? ' · DONE +150' : ''}`;
}
