// Keyboard and mouse input: one object the loop polls each step.
// Keys are tracked by code (ArrowLeft, KeyA, Space, ...); clicks set a waypoint
// the boat steers toward. `pressed` fires once per physical press.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let waypoint = null;
  let mouse = { x: 0, y: 0 };

  function onKeyDown(event) {
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onPointerDown(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    mouse = { x, y };
    waypoint = { x, y };
  }
  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);

  return {
    get left() { return keys.has('ArrowLeft') || keys.has('KeyA'); },
    get right() { return keys.has('ArrowRight') || keys.has('KeyD'); },
    get sailUp() { return keys.has('ArrowUp') || keys.has('KeyW'); },
    get sailDown() { return keys.has('ArrowDown') || keys.has('KeyS'); },
    wasPressed(code) { return pressed.has(code); },
    endStep() { pressed.clear(); },
    get waypoint() { return waypoint; },
    clearWaypoint() { waypoint = null; },
    get mouse() { return mouse; },
  };
}
