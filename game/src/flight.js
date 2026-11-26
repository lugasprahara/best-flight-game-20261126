// The Kestrel K-1 flight model: throttle, airspeed, bank, pitch, altitude, fuel and hull.
// Deliberately a pilot's model, not an engineer's: the throttle sets a target airspeed the
// engine chases, the wing stalls below its speed and sinks, and a banked wing both turns
// the aircraft sideways across the course and costs a little height, as a real one does.
import { FUEL, PLANE } from './config.js';

export function createPlane() {
  return {
    x: 0, // metres right of the course centreline
    alt: 62, // metres above the ground
    speed: 38, // metres per second
    throttle: 0.45, // 0..1
    bank: 0, // smoothed -1..1
    pitch: 0, // smoothed -1..1
    fuel: FUEL.tank,
    hull: 3, // hits the airframe can take
    distance: 0, // metres flown this sortie
    verticalSpeed: 0,
    stalling: false,
    invulnerable: 0, // seconds of grace after a hit
    shake: 0, // impact shake, decays
    propPhase: 0, // propeller rotation, for the renderer
  };
}

export function resetPlane(plane) {
  Object.assign(plane, createPlane());
}

/**
 * Advance the aircraft one fixed step under the pilot's axes
 * ({bank, pitch, throttleDelta}). Returns nothing; read the plane's fields.
 */
export function stepPlane(plane, axes, dt) {
  // The controls answer through a little inertia: bank and pitch ease toward the stick.
  plane.bank += (axes.bank - plane.bank) * Math.min(1, PLANE.bankRate * dt * 2.4);
  plane.pitch += (axes.pitch - plane.pitch) * Math.min(1, PLANE.pitchRate * dt * 2.4);
  plane.throttle = clamp(plane.throttle + axes.throttleDelta * dt * 0.55, 0, 1);

  // Airspeed chases the throttle's target; a climb bleeds speed, a dive gains it.
  const target = PLANE.idleSpeed + plane.throttle * PLANE.throttleSpan;
  const energyTrade = -plane.pitch * 2.6;
  plane.speed += clamp(target + energyTrade - plane.speed, -1, 1) * PLANE.accel * dt;
  plane.speed = clamp(plane.speed, PLANE.minSpeed, PLANE.maxSpeed);

  // Lift: enough speed and the pitch commands climb; too little and the nose drops away.
  plane.stalling = plane.speed < PLANE.stallSpeed;
  let climb = plane.pitch * plane.speed * PLANE.climbFactor;
  if (plane.stalling) climb -= (PLANE.stallSpeed - plane.speed) * 0.85;
  climb -= Math.abs(plane.bank) * plane.speed * 0.055; // a banked wing lifts less
  plane.verticalSpeed = climb;
  plane.alt = clamp(plane.alt + climb * dt, 0, PLANE.maxAltitude);

  // A banked wing slides the aircraft across the course.
  plane.x += plane.bank * plane.speed * PLANE.turnFactor * dt;

  // Fuel burns with the throttle; distance accrues with the airspeed.
  plane.fuel = Math.max(0, plane.fuel - (FUEL.baseDrain + plane.throttle * FUEL.throttleDrain) * dt);
  plane.distance += plane.speed * dt;
  plane.propPhase = (plane.propPhase + dt * (6 + plane.throttle * 30)) % (Math.PI * 2);
  plane.invulnerable = Math.max(0, plane.invulnerable - dt);
  plane.shake = Math.max(0, plane.shake - dt * 1.7);
}

/** Register a collision: lose a hull point and take the shake. Returns false if it was fatal. */
export function damagePlane(plane) {
  if (plane.invulnerable > 0) return plane.hull > 0;
  plane.hull -= 1;
  plane.invulnerable = 2.2;
  plane.shake = 1;
  return plane.hull > 0;
}

/** Display heading in degrees: the course runs 090, wandered by bank and drift. */
export function headingDegrees(plane) {
  const wander = plane.bank * 16 + plane.x * 0.045;
  return ((90 + wander) % 360 + 360) % 360;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
