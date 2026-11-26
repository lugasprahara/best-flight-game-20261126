// Kestrel Circuit — the game's conductor. It owns the screen state (title, play, pause,
// mission splash, sortie over), runs the fixed-step simulation, feeds the pilot's axes
// from input.js into flight.js and world.js, plays the sounds those events call for,
// and draws scene, cockpit and screens in that order, every frame.
import { STEP, VIEW } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlane, resetPlane, stepPlane } from './flight.js';
import { EV, createWorld, currentMission, stepWorld } from './world.js';
import { drawScene } from './render.js';
import { drawCockpit, drawHud } from './cockpit.js';
import { drawGameOver, drawMissionSplash, drawPause, drawTitle } from './screens.js';
import { autopilotAxes, stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const statusEl = document.getElementById('status');

const input = createInput(window);
input.setViewSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => input.setViewSize(window.innerWidth, window.innerHeight));
const audio = createAudio();

const SCREEN = { TITLE: 'title', PLAY: 'play', PAUSE: 'pause', SPLASH: 'splash', OVER: 'over' };
let screen = SCREEN.TITLE;
let plane = createPlane();
let world = createWorld(20261126);
let circuit = 1;
let splashT = 0;
let best = loadBest();
let accumulator = 0;
let lastStamp = performance.now();
let warnBeepT = 0;
const env = { time: 0, stormMix: 0, flash: 99, damageFlash: 0 };

function loadBest() {
  try {
    return Number(localStorage.getItem('kestrel-circuit-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem('kestrel-circuit-best', String(Math.floor(best)));
  } catch {
    /* a private window keeps no records; the sortie still counts */
  }
}

function newCircuit(seed) {
  resetPlane(plane);
  world = createWorld(seed);
  circuit = 1;
  screen = SCREEN.PLAY;
  announce(`Circuit ${circuit}. ${currentMission(world).name}: thread ${currentMission(world).goal} rings.`);
}

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

/** Step the simulation once and make the sounds the step's events call for. */
function simulate(dt, axes) {
  stepPlane(plane, axes, dt);
  const events = stepWorld(world, plane, dt);
  if (events & EV.RING_CLEAN) audio.ring(true);
  if (events & EV.RING_EDGE) audio.ring(false);
  if (events & EV.DRUM) audio.drum();
  if (events & EV.HIT) audio.hit();
  if (events & EV.THUNDER) audio.thunder();
  if (events & EV.LANDED) audio.fanfare();
  if (events & EV.MISSION) {
    audio.fanfare();
    splashT = 2.6;
    if (screen === SCREEN.PLAY) screen = SCREEN.SPLASH;
    const next = currentMission(world);
    if (next) announce(`Sortie complete. Next: ${next.name}.`);
  }
  if (world.over && screen !== SCREEN.OVER) {
    screen = SCREEN.OVER;
    best = Math.max(best, Math.floor(world.score));
    world.best = best;
    saveBest();
    announce(world.overReason === 'TOUCHDOWN' ? 'Touchdown. Circuit complete.' : `Sortie over: ${world.overReason}`);
  }
}

function attractAxes() {
  // The title-screen pilot flies the dawn circuit gently, chasing whatever is next.
  let target = null;
  for (const obj of world.objects) {
    if (obj.resolved || (obj.kind !== 'ring' && obj.kind !== 'drum')) continue;
    const dz = obj.at - plane.distance;
    if (dz > 0 && (target === null || dz < target.dz)) target = { x: obj.x, y: obj.y, dz };
  }
  const t = target || { x: 0, y: 80 };
  return autopilotAxes(plane, t.x, t.y, 0.5);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - lastStamp) / 1000);
  lastStamp = now;
  env.time += dt;
  env.stormMix += ((world.stormActive ? 1 : 0) - env.stormMix) * Math.min(1, dt * 1.6);
  env.flash = world.flash;
  env.damageFlash = plane.shake;

  handleActions();

  if (screen === SCREEN.PLAY || screen === SCREEN.SPLASH) {
    accumulator += dt;
    while (accumulator >= STEP) {
      simulate(STEP, input.state);
      accumulator -= STEP;
      if (screen === SCREEN.OVER) {
        accumulator = 0;
        break;
      }
    }
    if (screen === SCREEN.SPLASH) {
      splashT -= dt;
      if (splashT <= 0) screen = SCREEN.PLAY;
    }
    warnBeepT -= dt;
    if ((plane.stalling || plane.fuel < 18) && warnBeepT <= 0 && screen === SCREEN.PLAY) {
      audio.warning();
      warnBeepT = 0.85;
    }
  } else if (screen === SCREEN.TITLE) {
    accumulator += dt;
    while (accumulator >= STEP) {
      stepPlane(plane, attractAxes(), STEP);
      stepWorld(world, plane, STEP);
      if (world.over) {
        resetPlane(plane);
        world = createWorld(20261126);
      }
      accumulator -= STEP;
    }
  }
  audio.engine(plane.throttle, plane.speed / 72, screen === SCREEN.PLAY || screen === SCREEN.SPLASH);

  drawScene(ctx, VIEW, plane, world, env);
  if (screen !== SCREEN.TITLE) {
    drawHud(ctx, VIEW, plane, world);
    drawCockpit(ctx, VIEW, plane, world);
  }
  if (screen === SCREEN.TITLE) drawTitle(ctx, VIEW, best);
  if (screen === SCREEN.PAUSE) drawPause(ctx, VIEW);
  if (screen === SCREEN.SPLASH) drawMissionSplash(ctx, VIEW, currentMission(world), circuit);
  if (screen === SCREEN.OVER) drawGameOver(ctx, VIEW, world, best);
}

function handleActions() {
  const start = input.takePressed('enter') || input.takePressed(' ') || input.takePressed('pointer');
  if (input.takePressed('wheelup')) plane.throttle = Math.min(1, plane.throttle + 0.07);
  if (input.takePressed('wheeldown')) plane.throttle = Math.max(0, plane.throttle - 0.07);
  if (input.takePressed('m')) audio.setMuted(!audio.isMuted());
  if (screen === SCREEN.TITLE && start) {
    audio.unlock();
    newCircuit((Math.random() * 1e9) | 0);
  } else if (screen === SCREEN.OVER && start) {
    audio.unlock();
    newCircuit((Math.random() * 1e9) | 0);
  } else if (screen === SCREEN.PLAY && (input.takePressed('p') || input.takePressed('escape'))) {
    screen = SCREEN.PAUSE;
    announce('Paused.');
  } else if (screen === SCREEN.PAUSE && (start || input.takePressed('p') || input.takePressed('escape'))) {
    screen = SCREEN.PLAY;
    announce('Flying again.');
  }
}

// Screenshot staging: ?shot=start|chase|approach|end&seed=n freezes a staged scene.
const params = new URLSearchParams(location.search);
if (params.has('shot')) {
  const staged = stageShot(params.get('shot'), Number(params.get('seed')) || 1);
  plane = staged.plane;
  world = staged.world;
  world.best = best;
  screen = staged.screen === 'title' ? SCREEN.TITLE : staged.screen === 'over' ? SCREEN.OVER : SCREEN.PLAY;
  if (screen === SCREEN.OVER) best = Math.max(best, Math.floor(world.score));
  const frozen = { plane, world };
  (function drawFrozen() {
    env.time += 1 / 60;
    env.stormMix = world.stormActive ? 1 : 0;
    env.flash = world.flash;
    env.damageFlash = plane.shake;
    drawScene(ctx, VIEW, frozen.plane, frozen.world, env);
    if (screen !== SCREEN.TITLE) {
      drawHud(ctx, VIEW, frozen.plane, frozen.world);
      drawCockpit(ctx, VIEW, frozen.plane, frozen.world);
    }
    if (screen === SCREEN.TITLE) drawTitle(ctx, VIEW, best);
    if (screen === SCREEN.OVER) drawGameOver(ctx, VIEW, frozen.world, best);
    requestAnimationFrame(drawFrozen);
  })();
  window.__kestrelShot = staged.screen;
} else {
  requestAnimationFrame(frame);
}
