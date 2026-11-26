// Kestrel Circuit — the hand-in program (Node 22, standard library only).
//
// The game itself is the static site under game/: plain files a desktop browser opens
// offline, no build step, no network. This program packages an entry exactly the way
// make.fun's gate expects to find it: it copies game/ and screenshots/ into the output
// directory and writes dossier.json there with the vendored make.fun library, so the
// dossier the judge reads is the one the library itself builds from those files.
//
// In the grader the output directory is /output; anywhere else, MAKEFUN_OUTPUT_DIR
// names it instead:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own limits, passed to the dossier builder so an entry that would break
// them is refused here rather than at the gate: at most 4 screenshots of 256 KiB,
// at most 993 files and 48 MiB under game/, no game path over 1000 bytes, and the
// dossier's source text capped at 160 KiB.
const GATE_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function handIn() {
  mkdirSync(outputDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  const shotsDir = join(repoRoot, 'screenshots');
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
  }
  const dossier = buildDossier(outputDir, GATE_LIMITS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
}

handIn();
