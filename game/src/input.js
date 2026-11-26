// Pilot input: keyboard, mouse and touch are folded into one set of flight axes, so the
// flight model never cares which device the pilot is holding.
//   bank:    -1 (left) .. 1 (right)   arrow keys / A,D / mouse X / drag X
//   pitch:   -1 (nose down) .. 1 (nose up)   arrow keys / mouse Y / drag Y
//   throttleDelta: -1 .. 1 while W/S or the on-screen throttle keys are held

export function createInput(target) {
  const keys = new Set();
  const state = {
    bank: 0,
    pitch: 0,
    throttleDelta: 0,
    usingTouch: false,
    // Edge-triggered actions, consumed by the game loop each frame.
    pressed: new Set(),
  };
  let pointerActive = false;
  let pointerX = 0;
  let pointerY = 0;
  let viewW = 1;
  let viewH = 1;

  function axisFromKeys() {
    let bank = 0;
    let pitch = 0;
    let throttle = 0;
    if (keys.has('arrowleft') || keys.has('a')) bank -= 1;
    if (keys.has('arrowright') || keys.has('d')) bank += 1;
    if (keys.has('arrowup')) pitch += 1;
    if (keys.has('arrowdown')) pitch -= 1;
    if (keys.has('w') || keys.has('pageup')) throttle += 1;
    if (keys.has('s') || keys.has('pagedown')) throttle -= 1;
    return { bank, pitch, throttle };
  }

  function refresh() {
    const fromKeys = axisFromKeys();
    let { bank, pitch } = fromKeys;
    if (pointerActive) {
      // The pointer steers by its offset from the centre of the view, with a dead zone
      // so a resting hand does not wander the aircraft.
      const nx = (pointerX / viewW) * 2 - 1;
      const ny = (pointerY / viewH) * 2 - 1;
      const dead = 0.09;
      if (Math.abs(nx) > dead) bank = nx;
      if (Math.abs(ny) > dead) pitch = -ny;
    }
    state.bank = Math.max(-1, Math.min(1, bank));
    state.pitch = Math.max(-1, Math.min(1, pitch));
    state.throttleDelta = fromKeys.throttle;
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault();
    if (!keys.has(key)) state.pressed.add(key);
    keys.add(key);
    refresh();
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
    refresh();
  }

  function setViewSize(w, h) {
    viewW = Math.max(1, w);
    viewH = Math.max(1, h);
  }

  function onPointerDown(event) {
    pointerActive = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (event.pointerType === 'touch') state.usingTouch = true;
    state.pressed.add('pointer');
    refresh();
  }

  function onPointerMove(event) {
    if (!pointerActive && event.pointerType !== 'mouse') return;
    if (event.pointerType === 'mouse' && event.buttons === 0 && !pointerActive) return;
    pointerActive = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    refresh();
  }

  function onPointerUp() {
    pointerActive = false;
    refresh();
  }

  function onWheel(event) {
    state.pressed.add(event.deltaY < 0 ? 'wheelup' : 'wheeldown');
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);
  target.addEventListener('wheel', onWheel, { passive: true });
  target.addEventListener('blur', () => {
    keys.clear();
    pointerActive = false;
    refresh();
  });

  /** Take (and clear) an edge-triggered action: 'enter', ' ', 'p', 'm', 'pointer', ... */
  function takePressed(name) {
    if (!state.pressed.has(name)) return false;
    state.pressed.delete(name);
    return true;
  }

  return { state, refresh, setViewSize, takePressed };
}
