// Screenshot staging behind ?shot=start|chase|approach|end&seed=n. Each scene flies the
// real simulation forward from a fresh world under a simple autopilot, so the frame is a
// moment the game itself produced — the same seed always stages the same frame.
import { STEP } from './config.js';
import { createPlane, stepPlane, clamp } from './flight.js';
import { createWorld, stepWorld } from './world.js';

/**
 * A competent-enough pilot: steer toward a target point in (x, altitude) space and hold
 * a target throttle. Used by the screenshot scenes and the title-screen attract flight.
 */
export function autopilotAxes(plane, targetX, targetAlt, targetThrottle) {
  return {
    bank: clamp((targetX - plane.x) * 0.02, -0.85, 0.85),
    pitch: clamp((targetAlt - plane.alt) * 0.045, -0.8, 0.8),
    throttleDelta: clamp((targetThrottle - plane.throttle) * 2.2, -1, 1),
  };
}

/** The next thing worth flying at: the nearest unresolved ring or drum ahead. */
function nextTarget(world, plane) {
  let best = null;
  for (const obj of world.objects) {
    if (obj.resolved) continue;
    if (obj.kind !== 'ring' && obj.kind !== 'drum') continue;
    const dz = obj.at - plane.distance;
    if (dz > 0 && (best === null || dz < best.dz)) best = { x: obj.x, y: obj.y, dz };
  }
  return best;
}

function flyAutopilot(plane, world, seconds, throttle) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const target = nextTarget(world, plane) || { x: 0, y: 80 };
    stepPlane(plane, autopilotAxes(plane, target.x, target.y, throttle), STEP);
    stepWorld(world, plane, STEP);
    if (world.over) break;
  }
}

/**
 * Stage the named scene on a fresh plane and world and return all three, with the
 * screen to show: 'title', 'play' or 'over'.
 */
export function stageShot(name, seed) {
  const plane = createPlane();
  const world = createWorld(seed);
  if (name === 'chase') {
    // Fly the dawn circuit until a ring sits ahead in comfortable view, then hold.
    for (let i = 0; i < 46 / STEP; i += 1) {
      const target = nextTarget(world, plane) || { x: 0, y: 80 };
      stepPlane(plane, autopilotAxes(plane, target.x, target.y, 0.55), STEP);
      stepWorld(world, plane, STEP);
      const next = nextTarget(world, plane);
      if (i > 8 / STEP && next && next.dz > 130 && next.dz < 300) break;
      if (world.over) break;
    }
    return { plane, world, screen: 'play' };
  }
  if (name === 'approach') {
    // Jump to the final sortie, lay the runway out, and settle onto the glide path.
    world.missionIndex = 3;
    world.approachLeg = 700;
    for (let i = 0; i < 40 / STEP; i += 1) {
      if (world.runway) {
        const dz = world.runway.start - plane.distance;
        const glideAlt = Math.max(9, dz * 0.088 + 5);
        stepPlane(plane, autopilotAxes(plane, 0, glideAlt, dz > 260 ? 0.4 : 0.22), STEP);
        stepWorld(world, plane, STEP);
        if (dz < 330 && dz > 150) break;
      } else {
        stepPlane(plane, autopilotAxes(plane, 0, 55, 0.45), STEP);
        stepWorld(world, plane, STEP);
      }
      if (world.over) break;
    }
    return { plane, world, screen: 'play' };
  }
  if (name === 'end') {
    // A hurried pilot's ending: full throttle, nose down, no recovery.
    for (let i = 0; i < 30 / STEP && !world.over; i += 1) {
      stepPlane(plane, { bank: 0.25, pitch: -1, throttleDelta: 1 }, STEP);
      stepWorld(world, plane, STEP);
    }
    return { plane, world, screen: 'over' };
  }
  // 'start' and anything else: a gentle attract flight behind the title card.
  flyAutopilot(plane, world, 6, 0.5);
  return { plane, world, screen: 'title' };
}
