// Kestrel Circuit — tuning constants for the flight model, the world and the view.
// Every number the game flies by lives here, so the feel can be tuned in one place.

/** Logical canvas size; the page scales this to fit the window. */
export const VIEW = { width: 1280, height: 800 };

/** Fixed simulation step, in seconds; the loop accumulates real time into these. */
export const STEP = 1 / 120;

/** The Kestrel K-1's flight envelope, in metres and metres per second. */
export const PLANE = {
  minSpeed: 15,
  maxSpeed: 72,
  idleSpeed: 21, // airspeed the throttle's zero point holds
  throttleSpan: 50, // extra airspeed at full throttle
  accel: 7.5, // how fast the airspeed chases the throttle, m/s per second
  stallSpeed: 25, // below this the wing stops holding the nose up
  maxAltitude: 235,
  groundClearance: 3.2, // altitude at which the wheels meet the ground
  bankRate: 2.6, // how fast the wings answer the stick, per second
  pitchRate: 2.2,
  turnFactor: 0.62, // lateral metres per second per unit of bank, scaled by speed
  climbFactor: 0.36, // climb metres per second per unit of pitch, scaled by speed
};

/** Fuel: a sortie is a budgeting exercise, not a formality. */
export const FUEL = {
  tank: 100,
  baseDrain: 0.28, // units per second at idle throttle
  throttleDrain: 0.85, // extra units per second at full throttle
  drumRefill: 30,
};

/** Scoring. */
export const SCORE = {
  ringClean: 150, // through the middle of the ring
  ringEdge: 100, // clipped through the ring's rim
  drum: 75,
  distancePerMetre: 0.1,
  landingBase: 500,
  landingBonusMax: 500,
  missionBonus: 250,
};

/** The world ahead of the aircraft: how far is generated and drawn. */
export const WORLD = {
  viewDistance: 980, // metres ahead that objects are projected
  spawnAhead: 1020, // metres ahead that objects are created
  courseHalfWidth: 235, // soft wall: the island's flyable width each side
  ringRadius: 15, // metres; fly through the hoop
};

/** The four sorties of one circuit, in order. */
export const MISSIONS = [
  { id: 'rings', name: 'Dawn Circuit', goal: 8, kind: 'ring' },
  { id: 'fuel', name: 'Fuel Run', goal: 6, kind: 'drum' },
  { id: 'storm', name: 'Storm Line', goal: 6, kind: 'ring' },
  { id: 'approach', name: 'Harbour Approach', goal: 1, kind: 'landing' },
];

/** Colours of one consistent painted world: dawn gold over a green island. */
export const PALETTE = {
  skyTop: '#2e5f8a',
  skyHorizon: '#f2c98a',
  stormTop: '#3a4356',
  stormHorizon: '#8d97a5',
  sea: '#2b6f8e',
  sand: '#e3cf9e',
  fields: ['#69a84f', '#7cb35a', '#94bd63', '#5d9c4a', '#c9b458', '#a8bf5e'],
  forest: '#3f7a3c',
  river: '#3d84a8',
  runway: '#4a4d52',
};
