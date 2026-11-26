// The island world: what spawns ahead of the aircraft, what it can hit, and the four
// sorties of the circuit. The terrain itself is a function of world coordinates (see
// groundKindAt), so it is the same island from every distance and needs no storage;
// only the flown objects — rings, drums, storm cells, peaks, birds, the runway — are kept.
import { MISSIONS, PLANE, SCORE, WORLD } from './config.js';
import { cellHash, createRng, range } from './random.js';
import { damagePlane } from './flight.js';

export const EV = {
  RING_CLEAN: 1,
  RING_EDGE: 2,
  DRUM: 4,
  HIT: 8,
  MISSION: 16,
  CRASH: 32,
  FLAMEOUT: 64,
  LANDED: 128,
  GO_AROUND: 256,
  THUNDER: 512,
};

export const KIND = { RING: 'ring', DRUM: 'drum', STORM: 'storm', PEAK: 'peak', BIRD: 'bird', CLOUD: 'cloud' };

/** The river's centreline wanders across the island as distance runs on. */
export function riverCenterX(z) {
  return 150 * Math.sin(z * 0.0011) + 60 * Math.sin(z * 0.0037 + 1.7);
}

/**
 * What the ground is at a world point: 'sea', 'sand', 'river', 'forest' or a field index.
 * The island is a strip: sea beyond its shores, a beach, then patchwork fields and
 * forest, cut by the river. Deterministic in (x, z), so near and far views agree.
 */
export function groundKindAt(x, z) {
  const ax = Math.abs(x);
  if (ax > 345) return 'sea';
  if (ax > 318) return 'sand';
  if (Math.abs(x - riverCenterX(z)) < 26) return 'river';
  const cellX = Math.floor(x / 46);
  const cellZ = Math.floor(z / 46);
  const h = cellHash(cellX, cellZ);
  if (h > 0.86) return 'forest';
  return `field${Math.floor(h * 6) % 6}`;
}

export function createWorld(seed) {
  return {
    rng: createRng(seed),
    objects: [],
    nextSpawnAt: 240,
    missionIndex: 0,
    progress: 0,
    score: 0,
    ringsPassed: 0,
    drumsCollected: 0,
    landed: false,
    landingScore: 0,
    over: false,
    overReason: '',
    runway: null, // {start, length} in distance metres, once the approach is set up
    approachLeg: 0, // metres flown in the approach mission before the runway appears
    stormActive: false,
    time: 0,
    lightningIn: range(createRng(seed ^ 0x9e37), 4, 9),
    flash: 0, // seconds since the last lightning flash, for the renderer
    message: '', // short centre-screen note: CLEAN, MISS, GO AROUND...
    messageT: 0,
  };
}

export function currentMission(world) {
  return MISSIONS[world.missionIndex] || null;
}

function note(world, text) {
  world.message = text;
  world.messageT = 1.6;
}

function spawn(world, kind, at, x, y, extra = {}) {
  world.objects.push({ kind, at, x, y, resolved: false, phase: world.rng() * Math.PI * 2, ...extra });
}

/** Create whatever the current sortie puts ahead, up to the spawn horizon. */
function spawnAhead(world, plane) {
  const mission = currentMission(world);
  if (!mission) return;
  const horizon = plane.distance + WORLD.spawnAhead;
  while (world.nextSpawnAt < horizon) {
    const at = world.nextSpawnAt;
    const r = world.rng;
    if (mission.id === 'rings') {
      spawn(world, KIND.RING, at, range(r, -130, 130), range(r, 30, 148));
      if (r() < 0.3) spawn(world, KIND.PEAK, at + 130, r() < 0.5 ? range(r, -225, -175) : range(r, 175, 225), 0, { height: range(r, 55, 95) });
      world.nextSpawnAt += range(r, 285, 395);
    } else if (mission.id === 'fuel') {
      spawn(world, KIND.DRUM, at, range(r, -140, 140), range(r, 20, 112));
      if (r() < 0.45) spawn(world, KIND.RING, at + 170, range(r, -110, 110), range(r, 35, 140));
      if (r() < 0.35) spawn(world, KIND.BIRD, at + 90, range(r, -160, 160), range(r, 45, 120), { vx: range(r, 9, 17) * (r() < 0.5 ? -1 : 1) });
      world.nextSpawnAt += range(r, 235, 330);
    } else if (mission.id === 'storm') {
      spawn(world, KIND.RING, at, range(r, -120, 120), range(r, 32, 150));
      spawn(world, KIND.STORM, at + range(r, 120, 220), range(r, -120, 120), range(r, 55, 105));
      if (r() < 0.5) spawn(world, KIND.STORM, at + range(r, 200, 300), range(r, -150, 150), range(r, 45, 120));
      if (r() < 0.45) spawn(world, KIND.PEAK, at + 160, range(r, -120, 120), 0, { height: range(r, 60, 105) });
      world.nextSpawnAt += range(r, 300, 390);
    } else if (mission.id === 'approach') {
      // Two bonus rings on the way in, then the runway itself is placed by stepWorld.
      if (world.approachLeg < 2) spawn(world, KIND.RING, at, range(r, -70, 70), range(r, 30, 90));
      world.nextSpawnAt += 420;
    }
    // Ambient cloud puffs drift over every sortie, high and harmless.
    if (world.rng() < 0.8) {
      spawn(world, KIND.CLOUD, at + range(world.rng, 0, 160), range(world.rng, -280, 280), range(world.rng, 95, 215));
    }
  }
}

function completeMission(world, plane) {
  world.score += SCORE.missionBonus;
  world.missionIndex += 1;
  world.progress = 0;
  world.approachLeg = 0;
  world.runway = null;
  plane.fuel = Math.min(100, plane.fuel + 26); // the ground crew tops the tank up a little
  plane.hull = Math.min(3, plane.hull + 1); // ...and patches the worst of the dents
}

/**
 * Advance the world one step against the (already stepped) aircraft. Returns the EV
 * bitmask of everything that happened: rings scored, hits taken, missions completed,
 * and the ways a sortie can end.
 */
export function stepWorld(world, plane, dt) {
  let events = 0;
  world.time += dt;
  world.flash += dt;
  world.messageT = Math.max(0, world.messageT - dt);
  const mission = currentMission(world);
  world.stormActive = !!mission && mission.id === 'storm';

  if (world.stormActive) {
    world.lightningIn -= dt;
    if (world.lightningIn <= 0) {
      world.lightningIn = range(world.rng, 3.5, 9);
      world.flash = 0;
      events |= EV.THUNDER;
    }
  }

  spawnAhead(world, plane);

  // The approach: after a short leg the runway is laid out ahead; overshoot it and
  // the pilot goes around and it is laid out again, further on.
  if (mission && mission.id === 'approach' && !world.landed) {
    world.approachLeg += plane.speed * dt;
    if (!world.runway && world.approachLeg > 620) {
      world.runway = { start: plane.distance + 560, length: 640 };
      note(world, 'RUNWAY IN SIGHT');
    }
    if (world.runway && plane.distance > world.runway.start + world.runway.length + 120) {
      world.runway = { start: plane.distance + 620, length: 640 };
      world.score = Math.max(0, world.score - 100);
      note(world, 'GO AROUND');
      events |= EV.GO_AROUND;
    }
  }

  const prevDistance = plane.distance - plane.speed * dt;
  for (const obj of world.objects) {
    const dz = obj.at - plane.distance;
    if (obj.kind === KIND.BIRD && !obj.resolved) obj.x += obj.vx * dt;
    if (obj.resolved) continue;

    if (obj.kind === KIND.RING || obj.kind === KIND.DRUM) {
      if (prevDistance < obj.at && plane.distance >= obj.at) {
        obj.resolved = true;
        const d = Math.hypot(plane.x - obj.x, plane.alt - obj.y);
        if (obj.kind === KIND.RING) {
          if (d < WORLD.ringRadius * 0.55) {
            world.score += SCORE.ringClean;
            world.ringsPassed += 1;
            if (mission && mission.kind === 'ring') world.progress += 1;
            note(world, 'CLEAN +150');
            events |= EV.RING_CLEAN;
          } else if (d < WORLD.ringRadius) {
            world.score += SCORE.ringEdge;
            world.ringsPassed += 1;
            if (mission && mission.kind === 'ring') world.progress += 1;
            note(world, 'THROUGH +100');
            events |= EV.RING_EDGE;
          } else {
            note(world, 'MISS');
          }
        } else if (d < 14) {
          world.score += SCORE.drum;
          world.drumsCollected += 1;
          plane.fuel = Math.min(100, plane.fuel + 30);
          if (mission && mission.kind === 'drum') world.progress += 1;
          note(world, 'FUEL +30');
          events |= EV.DRUM;
        }
      }
    } else if (obj.kind === KIND.STORM) {
      if (Math.abs(dz) < 30 && Math.abs(plane.x - obj.x) < 36 && Math.abs(plane.alt - obj.y) < 38) {
        obj.resolved = true;
        if (!damagePlane(plane)) return finishWith(events | EV.HIT, world, 'THE STORM TOOK THE KESTREL DOWN');
        note(world, 'STORM HIT');
        events |= EV.HIT;
      }
    } else if (obj.kind === KIND.PEAK) {
      const halfWidth = 30 * Math.max(0, 1 - plane.alt / (obj.height * 1.25));
      if (Math.abs(dz) < 26 && Math.abs(plane.x - obj.x) < halfWidth + 6 && plane.alt < obj.height) {
        obj.resolved = true;
        if (!damagePlane(plane)) return finishWith(events | EV.HIT, world, 'TERRAIN — THE KESTREL IS DOWN');
        note(world, 'GRAZED THE PEAK');
        events |= EV.HIT;
      }
    } else if (obj.kind === KIND.BIRD) {
      if (Math.abs(dz) < 9 && Math.abs(plane.x - obj.x) < 10 && Math.abs(plane.alt - obj.y) < 9) {
        obj.resolved = true;
        if (!damagePlane(plane)) return finishWith(events | EV.HIT, world, 'BIRD STRIKE — THE KESTREL IS DOWN');
        note(world, 'BIRD STRIKE');
        events |= EV.HIT;
      }
    }
  }
  // Drop what is well behind.
  world.objects = world.objects.filter((obj) => obj.at > plane.distance - 90);

  world.score += plane.speed * dt * SCORE.distancePerMetre;

  // Wheels meet ground: a landing on the runway, or the end of the sortie anywhere else.
  if (plane.alt <= PLANE.groundClearance && !world.over) {
    const rw = world.runway;
    const overRunway = rw && plane.distance >= rw.start - 30 && plane.distance <= rw.start + rw.length && Math.abs(plane.x) < 21;
    if (overRunway && plane.speed <= 37 && plane.verticalSpeed >= -7.5) {
      world.landed = true;
      const smoothness = Math.max(0, 1 - Math.abs(plane.verticalSpeed) / 7.5);
      const speedBonus = Math.max(0, 1 - Math.abs(plane.speed - 27) / 12);
      world.landingScore = Math.round(SCORE.landingBase + SCORE.landingBonusMax * (smoothness * 0.6 + speedBonus * 0.4));
      world.score += world.landingScore;
      world.over = true;
      world.overReason = 'TOUCHDOWN';
      events |= EV.LANDED;
    } else {
      return finishWith(events, world, overRunway ? 'IN TOO HOT — THE RUNWAY ATE THE GEAR' : 'TERRAIN — THE KESTREL IS DOWN');
    }
  }

  if (plane.fuel <= 0 && !world.over) {
    return finishWith(events, world, 'OUT OF FUEL — SHE GLIDED AS FAR AS SHE COULD');
  }

  if (mission && mission.kind !== 'landing' && world.progress >= mission.goal && !world.over) {
    completeMission(world, plane);
    events |= EV.MISSION;
  }
  return events;
}

function finishWith(events, world, reason) {
  world.over = true;
  world.overReason = reason;
  return events | EV.CRASH;
}
