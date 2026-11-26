// Rendering the world from the chase camera: a painted dawn island in one consistent
// style — gradient sky, two parallax ridge lines, patchwork fields scrolling in
// perspective, the river, and every flying object projected from world metres to
// screen pixels by one pinhole rule. The aircraft is drawn last, in frame centre,
// banked and pitching with the stick.
import { PALETTE, WORLD } from './config.js';
import { KIND, groundKindAt, riverCenterX } from './world.js';
import { smoothNoise } from './random.js';
import { clamp } from './flight.js';

const FOCAL = 470; // pinhole constant: screen offset = world offset * FOCAL / distance

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mix(a, b, t) {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}

function kindColor(kind, stormMix) {
  if (kind === 'sea') return mix(PALETTE.sea, '#4b5a66', stormMix);
  if (kind === 'sand') return mix(PALETTE.sand, '#9a958a', stormMix);
  if (kind === 'river') return mix(PALETTE.river, '#54626e', stormMix);
  if (kind === 'forest') return mix(PALETTE.forest, '#44584a', stormMix);
  const index = Number(kind.slice(5)) || 0;
  return mix(PALETTE.fields[index % PALETTE.fields.length], '#6d7263', stormMix);
}

/** The camera: where the horizon sits and where the world converges this frame. */
export function cameraFor(view, plane) {
  const horizonY = clamp(view.height * 0.415 - plane.pitch * 24 + (plane.alt - 60) * 0.1, view.height * 0.3, view.height * 0.52);
  const vpX = view.width / 2 - plane.x * 0.32 - plane.bank * 30;
  return { horizonY, vpX };
}

/** Project a world point (x right, y up, dz ahead) to screen pixels. */
export function project(view, cam, plane, x, y, dz) {
  const s = FOCAL / Math.max(dz, 1);
  return { x: cam.vpX + (x - plane.x) * s, y: cam.horizonY + (plane.alt - y) * s, s };
}

function drawSky(ctx, view, plane, env) {
  const top = mix(PALETTE.skyTop, PALETTE.stormTop, env.stormMix);
  const horizon = mix(PALETTE.skyHorizon, PALETTE.stormHorizon, env.stormMix);
  const grad = ctx.createLinearGradient(0, 0, 0, view.height * 0.62);
  grad.addColorStop(0, top);
  grad.addColorStop(1, horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, view.width, view.height);
  // The sun, low and golden, dimmed when the storm is up.
  const sunX = view.width * 0.76 - plane.x * 0.08;
  const sunY = view.height * 0.17;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
  glow.addColorStop(0, `rgba(255,236,180,${0.85 - env.stormMix * 0.6})`);
  glow.addColorStop(0.25, `rgba(255,205,120,${0.4 - env.stormMix * 0.3})`);
  glow.addColorStop(1, 'rgba(255,205,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
  ctx.fillStyle = `rgba(255,240,200,${0.95 - env.stormMix * 0.55})`;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 25, 0, Math.PI * 2);
  ctx.fill();
}

function drawRidges(ctx, view, cam, plane, env) {
  // Two silhouette ranges slide at different rates: the island feels deep.
  for (let layer = 0; layer < 2; layer += 1) {
    const base = cam.horizonY + 4 + layer * 13;
    const amp = layer === 0 ? 54 : 30;
    const drift = plane.x * (layer === 0 ? 0.06 : 0.16) + plane.distance * (layer === 0 ? 0.004 : 0.011);
    ctx.beginPath();
    ctx.moveTo(-20, base + 30);
    for (let sx = -20; sx <= view.width + 20; sx += 26) {
      const n = smoothNoise((sx + drift) * 0.006 + layer * 13.7, layer * 3.1);
      ctx.lineTo(sx, base - n * amp);
    }
    ctx.lineTo(view.width + 20, base + 30);
    ctx.closePath();
    ctx.fillStyle = layer === 0 ? mix('#7d94a8', '#5d6672', env.stormMix) : mix('#5b7a68', '#49584e', env.stormMix);
    ctx.globalAlpha = layer === 0 ? 0.75 : 0.95;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawTerrain(ctx, view, cam, plane, env) {
  // Perspective bands of ground, near bands tall, far bands thin, each split into
  // field cells whose kind comes from the island's own map function.
  const bands = [];
  let z = 5;
  while (z < WORLD.viewDistance) {
    const next = z * 1.16 + 2;
    bands.push([z, next]);
    z = next;
  }
  const cell = 46;
  for (let b = bands.length - 1; b >= 0; b -= 1) {
    const [z0, z1] = bands[b];
    const worldZ = plane.distance + (z0 + z1) / 2;
    const fog = clamp((z0 - 120) / 900, 0, 0.62);
    for (let cx = -460; cx < 460; cx += cell) {
      const kind = groundKindAt(cx + cell / 2, worldZ);
      const p00 = project(view, cam, plane, cx, 0, z1);
      const p10 = project(view, cam, plane, cx + cell, 0, z1);
      const p11 = project(view, cam, plane, cx + cell, 0, z0);
      const p01 = project(view, cam, plane, cx, 0, z0);
      if (p00.y < cam.horizonY - 2) continue;
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fillStyle = kindColor(kind, env.stormMix);
      ctx.fill();
      if (fog > 0.02) {
        ctx.fillStyle = `rgba(238,214,170,${fog * (1 - env.stormMix * 0.7)})`;
        ctx.fill();
      }
    }
  }
  // The river catches the light as it winds away.
  ctx.beginPath();
  for (let dz = 6; dz < 700; dz += 22) {
    const p = project(view, cam, plane, riverCenterX(plane.distance + dz), 0, dz);
    if (dz === 6) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = `rgba(220,240,250,${0.25 - env.stormMix * 0.15})`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawRunway(ctx, view, cam, plane, world, env) {
  const rw = world.runway;
  if (!rw) return;
  const dzStart = rw.start - plane.distance;
  const dzEnd = dzStart + rw.length;
  if (dzEnd < 8 || dzStart > WORLD.viewDistance) return;
  const near = Math.max(dzStart, 6);
  const a = project(view, cam, plane, -13, 0, dzEnd);
  const b = project(view, cam, plane, 13, 0, dzEnd);
  const c = project(view, cam, plane, 13, 0, near);
  const d = project(view, cam, plane, -13, 0, near);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = mix(PALETTE.runway, '#3c3f45', env.stormMix);
  ctx.fill();
  // Centreline dashes and threshold bars.
  ctx.fillStyle = 'rgba(245,245,240,0.9)';
  for (let z = Math.max(dzStart + 30, 10); z < dzEnd - 20; z += 46) {
    const p = project(view, cam, plane, 0, 0, z);
    const w = Math.max(1, 1.1 * p.s);
    const h = Math.max(1, 9 * p.s * 0.14);
    ctx.fillRect(p.x - w / 2, p.y - h, w, h);
  }
  // Edge lights: warm dots marching down both sides.
  for (let z = Math.max(dzStart, 10); z < dzEnd; z += 62) {
    for (const side of [-15, 15]) {
      const p = project(view, cam, plane, side, 0.5, z);
      const r = Math.max(1, 0.55 * p.s);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,190,90,0.95)';
      ctx.fill();
    }
  }
  // PAPI lights by the threshold: white when high, red when low, on the ideal glide.
  if (dzStart > 12 && dzStart < 700) {
    const idealAlt = dzStart * 0.088;
    const high = plane.alt > idealAlt + 4;
    const low = plane.alt < idealAlt - 4;
    for (let i = 0; i < 2; i += 1) {
      const p = project(view, cam, plane, -19 + i * 3.4, 1, dzStart + 6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.4, 0.7 * p.s), 0, Math.PI * 2);
      ctx.fillStyle = low || (high && i === 1) ? '#ff4b3e' : '#ffffff';
      ctx.fill();
    }
  }
}

function drawCloudPuff(ctx, x, y, r, dark, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = dark ? '#59616e' : '#fdfdf8';
  const bumps = [[0, 0, 1], [-0.8, 0.16, 0.66], [0.8, 0.14, 0.7], [-0.35, -0.3, 0.6], [0.4, -0.28, 0.62]];
  for (const [bx, by, br] of bumps) {
    ctx.beginPath();
    ctx.arc(x + bx * r, y + by * r, r * br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = dark ? 'rgba(30,34,44,0.35)' : 'rgba(160,175,190,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.42, r * 1.05, r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawRing(ctx, p, radiusPx, dz) {
  ctx.save();
  ctx.shadowColor = 'rgba(255,170,40,0.85)';
  ctx.shadowBlur = dz < 260 ? 18 : 6;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, radiusPx, radiusPx * 0.94, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffb02e';
  ctx.lineWidth = Math.max(2, radiusPx * 0.13);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, radiusPx * 0.86, radiusPx * 0.8, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,226,150,0.8)';
  ctx.lineWidth = Math.max(1, radiusPx * 0.045);
  ctx.stroke();
  ctx.restore();
}

function drawDrum(ctx, p, time, phase) {
  const w = Math.max(3, 4.6 * p.s);
  const h = Math.max(4, 6.4 * p.s);
  const bob = Math.sin(time * 2 + phase) * h * 0.08;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.fillStyle = 'rgba(20,30,20,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, h * 1.6, w * 0.9, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8722a';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.22);
  ctx.fill();
  ctx.fillStyle = '#fdfdf8';
  ctx.fillRect(-w / 2, -h * 0.12, w, h * 0.24);
  if (w > 15) {
    ctx.fillStyle = '#c7511d';
    ctx.font = `bold ${Math.round(h * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', 0, h * 0.02);
  }
  const blink = Math.sin(time * 5 + phase) > 0.4;
  ctx.fillStyle = blink ? '#ffe066' : 'rgba(255,224,102,0.35)';
  ctx.beginPath();
  ctx.arc(0, -h / 2 - 2, Math.max(1.2, w * 0.12), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPeak(ctx, view, cam, plane, obj, env) {
  const dz = obj.at - plane.distance;
  const baseL = project(view, cam, plane, obj.x - 34, 0, dz);
  const baseR = project(view, cam, plane, obj.x + 34, 0, dz);
  const apex = project(view, cam, plane, obj.x, obj.height, dz);
  ctx.beginPath();
  ctx.moveTo(baseL.x, baseL.y);
  ctx.lineTo(apex.x, apex.y);
  ctx.lineTo(baseR.x, baseR.y);
  ctx.closePath();
  ctx.fillStyle = mix('#5f7d5a', '#4c554e', env.stormMix);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(apex.x, apex.y);
  ctx.lineTo(apex.x + (baseR.x - apex.x) * 0.3, apex.y + (baseR.y - apex.y) * 0.28);
  ctx.lineTo(apex.x + (baseL.x - apex.x) * 0.3, apex.y + (baseL.y - apex.y) * 0.28);
  ctx.closePath();
  ctx.fillStyle = '#f4f7f5';
  ctx.fill();
}

function drawBird(ctx, p, time, phase) {
  const w = Math.max(2.5, 3.4 * p.s);
  const flap = Math.sin(time * 11 + phase) * w * 0.5;
  ctx.strokeStyle = '#26313a';
  ctx.lineWidth = Math.max(1, w * 0.16);
  ctx.beginPath();
  ctx.moveTo(p.x - w, p.y - flap);
  ctx.quadraticCurveTo(p.x - w * 0.4, p.y + w * 0.25, p.x, p.y);
  ctx.quadraticCurveTo(p.x + w * 0.4, p.y + w * 0.25, p.x + w, p.y - flap);
  ctx.stroke();
}

function drawObjects(ctx, view, cam, plane, world, env) {
  const sorted = world.objects
    .map((obj) => ({ obj, dz: obj.at - plane.distance }))
    .filter(({ dz }) => dz > 3 && dz < WORLD.viewDistance)
    .sort((a, b) => b.dz - a.dz);
  for (const { obj, dz } of sorted) {
    const p = project(view, cam, plane, obj.x, obj.y, dz);
    if (p.x < -320 || p.x > view.width + 320 || p.y < -260 || p.y > view.height + 200) continue;
    if (obj.kind === KIND.CLOUD) {
      drawCloudPuff(ctx, p.x, p.y, Math.max(6, 15 * p.s), false, clamp(1.15 - dz / 900, 0.25, 0.9));
    } else if (obj.kind === KIND.STORM) {
      drawCloudPuff(ctx, p.x, p.y, Math.max(10, 26 * p.s), true, 0.96);
      // Rain falls out of the cell in slanted streaks.
      ctx.strokeStyle = 'rgba(190,205,220,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 7; i += 1) {
        const rx = p.x + ((i * 37 + Math.floor(env.time * 9) * 13) % 60) - 30;
        const ry = p.y + 14 * p.s * 0.4 + ((i * 23 + Math.floor(env.time * 22) * 7) % 26);
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + 12);
      }
      ctx.stroke();
    } else if (obj.kind === KIND.RING) {
      drawRing(ctx, p, Math.max(3, 15 * p.s), dz);
    } else if (obj.kind === KIND.DRUM) {
      drawDrum(ctx, p, env.time, obj.phase);
    } else if (obj.kind === KIND.PEAK) {
      drawPeak(ctx, view, cam, plane, obj, env);
    } else if (obj.kind === KIND.BIRD) {
      drawBird(ctx, p, env.time, obj.phase);
    }
  }
}

/** The aircraft itself, from behind and above: it banks, pitches and shudders in frame. */
export function drawAircraft(ctx, view, plane, env) {
  // Ground shadow first: an ellipse on the field below, tight and dark when low.
  const cam = cameraFor(view, plane);
  const sh = project(view, cam, plane, plane.x, 0, 30);
  const shadowScale = clamp(30 / (18 + plane.alt), 0.25, 1);
  ctx.fillStyle = `rgba(15,25,15,${0.34 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(sh.x, sh.y, 95 * shadowScale + 12, 15 * shadowScale + 3, 0, 0, Math.PI * 2);
  ctx.fill();

  const cx = view.width / 2 - plane.bank * 16 + (plane.shake > 0 ? (Math.random() - 0.5) * 9 * plane.shake : 0);
  const cy = view.height * 0.585 - plane.pitch * 13 + Math.sin(env.time * 2.1) * 2.2 + (plane.shake > 0 ? (Math.random() - 0.5) * 8 * plane.shake : 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.bank * 0.42);
  ctx.globalAlpha = plane.invulnerable > 0 && Math.floor(env.time * 9) % 2 === 0 ? 0.45 : 1;
  const u = 1; // unit scale for the airframe drawing below
  // Tail feathers.
  ctx.fillStyle = '#d8542e';
  ctx.beginPath();
  ctx.roundRect(-52 * u, 34 * u, 104 * u, 13 * u, 6 * u);
  ctx.fill();
  // Main wing.
  const wingGrad = ctx.createLinearGradient(-118, 0, 118, 0);
  wingGrad.addColorStop(0, '#e8e4da');
  wingGrad.addColorStop(0.5, '#f7f4ec');
  wingGrad.addColorStop(1, '#e8e4da');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.roundRect(-118 * u, -6 * u, 236 * u, 17 * u, 8 * u);
  ctx.fill();
  ctx.fillStyle = '#d8542e';
  ctx.fillRect(-118 * u, -6 * u, 15 * u, 17 * u);
  ctx.fillRect(103 * u, -6 * u, 15 * u, 17 * u);
  // Fuselage, tail cone to nose.
  const bodyGrad = ctx.createLinearGradient(0, -64, 0, 52);
  bodyGrad.addColorStop(0, '#f2efe6');
  bodyGrad.addColorStop(1, '#cfc9ba');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(0, -66 * u);
  ctx.bezierCurveTo(13 * u, -60 * u, 15 * u, -30 * u, 13 * u, 2 * u);
  ctx.bezierCurveTo(11 * u, 30 * u, 6 * u, 46 * u, 0, 50 * u);
  ctx.bezierCurveTo(-6 * u, 46 * u, -11 * u, 30 * u, -13 * u, 2 * u);
  ctx.bezierCurveTo(-15 * u, -30 * u, -13 * u, -60 * u, 0, -66 * u);
  ctx.fill();
  // Vertical fin and rudder, with the K-1 mark.
  ctx.fillStyle = '#d8542e';
  ctx.beginPath();
  ctx.moveTo(0, 16 * u);
  ctx.lineTo(3 * u, 40 * u);
  ctx.lineTo(0, 52 * u);
  ctx.lineTo(-3 * u, 40 * u);
  ctx.closePath();
  ctx.fill();
  // Canopy glass.
  const glass = ctx.createLinearGradient(0, -52, 0, -18);
  glass.addColorStop(0, '#bfe3ef');
  glass.addColorStop(1, '#5d93a8');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.ellipse(0, -34 * u, 8.5 * u, 17 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  // Propeller: a blurred disc and two blade streaks at the nose.
  ctx.save();
  ctx.translate(0, -68 * u);
  ctx.fillStyle = 'rgba(40,40,40,0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 34 * u, 4.6 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(plane.propPhase);
  ctx.fillStyle = 'rgba(30,30,30,0.55)';
  ctx.fillRect(-33 * u, -1.6 * u, 66 * u, 3.2 * u);
  ctx.restore();
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(0, -68 * u, 3.6 * u, 0, Math.PI * 2);
  ctx.fill();
  // Navigation lights: red port, green starboard, winking.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-118 * u, 3 * u, 3 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#35e065';
  ctx.beginPath();
  ctx.arc(118 * u, 3 * u, 3 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWeather(ctx, view, env) {
  if (env.stormMix > 0.25) {
    ctx.strokeStyle = `rgba(200,215,230,${0.34 * env.stormMix})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 110; i += 1) {
      const rx = ((i * 173 + Math.floor(env.time * 26) * 29) % (view.width + 60)) - 30;
      const ry = ((i * 97 + Math.floor(env.time * 30) * 41) % (view.height + 40)) - 20;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 5, ry + 17);
    }
    ctx.stroke();
  }
  if (env.flash < 0.1) {
    ctx.fillStyle = `rgba(255,255,255,${(0.1 - env.flash) * 4.5})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
  if (env.damageFlash > 0) {
    ctx.fillStyle = `rgba(200,30,20,${env.damageFlash * 0.22})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
}

/** Draw the whole 3-D scene: sky, ridges, terrain, runway, objects, aircraft, weather. */
export function drawScene(ctx, view, plane, world, env) {
  const cam = cameraFor(view, plane);
  drawSky(ctx, view, plane, env);
  drawRidges(ctx, view, cam, plane, env);
  drawTerrain(ctx, view, cam, plane, env);
  drawRunway(ctx, view, cam, plane, world, env);
  drawObjects(ctx, view, cam, plane, world, env);
  drawAircraft(ctx, view, plane, env);
  drawWeather(ctx, view, env);
  // A soft vignette keeps the eye in the cockpit.
  const vg = ctx.createRadialGradient(view.width / 2, view.height / 2, view.height * 0.42, view.width / 2, view.height / 2, view.height * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,12,20,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, view.width, view.height);
}
