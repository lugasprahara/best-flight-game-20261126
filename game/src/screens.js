// Full-screen states: the title card, the pause veil, the mission splash and the
// end-of-sortie board. They sit over the live scene, so the aircraft is always in
// frame behind the words — the game never cuts to a menu that is not the game.
const INK = '#f5f1e6';
const AMBER = '#ffb02e';
const DIM = 'rgba(245,241,230,0.75)';

function veil(ctx, view, alpha) {
  ctx.fillStyle = `rgba(8,12,20,${alpha})`;
  ctx.fillRect(0, 0, view.width, view.height);
}

function centre(ctx, text, y, size, color, weight = 800) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, ctx.canvas.width / 2, y);
}

export function drawTitle(ctx, view, best) {
  veil(ctx, view, 0.34);
  centre(ctx, 'KESTREL CIRCUIT', 218, 74, AMBER);
  centre(ctx, 'An island-hopping flight trial in the little Kestrel K-1', 262, 22, INK, 600);
  const lines = [
    'Fly four sorties: thread the dawn rings, chase fuel drums,',
    'thread the storm line, then land her on the harbour runway.',
    '',
    'STEER  ← → ↑ ↓  or  A D + mouse / drag        THROTTLE  W / S  or wheel',
    'Bank to turn · watch the stall · drums are fuel · storms cost hull',
    '',
    'Press ENTER or tap to take off',
  ];
  lines.forEach((line, i) => centre(ctx, line, 330 + i * 30, 19, i === lines.length - 1 ? AMBER : DIM, i === lines.length - 1 ? 700 : 500));
  if (best > 0) centre(ctx, `Best score so far: ${Math.floor(best)}`, 596, 18, DIM, 600);
}

export function drawPause(ctx, view) {
  veil(ctx, view, 0.45);
  centre(ctx, 'PAUSED', 330, 52, AMBER);
  centre(ctx, 'Press P or ENTER to fly on', 386, 20, INK, 600);
}

export function drawMissionSplash(ctx, view, mission, circuit) {
  veil(ctx, view, 0.3);
  centre(ctx, `SORTIE COMPLETE`, 300, 34, AMBER, 700);
  centre(ctx, mission ? `Next: ${mission.name}` : `Circuit ${circuit} complete`, 356, 40, INK);
  centre(ctx, mission ? missionBrief(mission) : 'She is refuelled, patched, and ready to go again.', 398, 19, DIM, 500);
}

export function missionBrief(mission) {
  if (mission.kind === 'ring') return `Thread ${mission.goal} rings. Clean centres pay best.`;
  if (mission.kind === 'drum') return `Collect ${mission.goal} fuel drums before the tank runs dry.`;
  return 'Runway ahead. Slow below 70 kt, low and gentle, wheels on the stripes.';
}

export function drawGameOver(ctx, view, world, best) {
  veil(ctx, view, 0.52);
  const landed = world.overReason === 'TOUCHDOWN';
  centre(ctx, landed ? 'TOUCHDOWN — CIRCUIT COMPLETE' : 'SORTIE OVER', 236, landed ? 40 : 52, landed ? '#59e08a' : AMBER);
  if (!landed) centre(ctx, world.overReason, 282, 20, INK, 600);
  if (landed) centre(ctx, `Landing bonus ${world.landingScore} — she rolls to a stop in one piece.`, 282, 20, INK, 600);
  const rows = [
    ['Score', `${Math.floor(world.score)}`],
    ['Best', `${Math.floor(best)}`],
    ['Rings threaded', `${world.ringsPassed}`],
    ['Fuel drums', `${world.drumsCollected}`],
  ];
  rows.forEach(([k, v], i) => {
    ctx.font = '600 21px system-ui, sans-serif';
    ctx.fillStyle = DIM;
    ctx.textAlign = 'right';
    ctx.fillText(k, view.width / 2 - 16, 348 + i * 34);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText(v, view.width / 2 + 16, 348 + i * 34);
  });
  centre(ctx, 'Press ENTER or tap to fly again', 348 + rows.length * 34 + 28, 20, AMBER, 700);
}
