// Deterministic randomness: a seeded generator and a stable 2-D hash, so a given seed
// always grows the same island, the same weather and the same screenshot.

/** mulberry32: a small, fast seeded PRNG. Returns a function giving floats in [0, 1). */
export function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max) from the generator. */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** An integer in [min, max] from the generator. */
export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

/**
 * Stable hash of integer cell coordinates to a float in [0, 1). The terrain is coloured
 * cell by cell from this, so the island looks identical from any distance or session.
 */
export function cellHash(cellX, cellZ) {
  let h = Math.imul(cellX, 374761393) + Math.imul(cellZ, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise over the plane, bilinearly interpolated cell hashes. */
export function smoothNoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = cellHash(x0, z0);
  const b = cellHash(x0 + 1, z0);
  const c = cellHash(x0, z0 + 1);
  const d = cellHash(x0 + 1, z0 + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
