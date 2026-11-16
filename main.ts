// WINDWARD POST — a best-game-01 entry (Node 22, standard library only).
// v3: the mail run grows a planning layer — placeable channel buoys. Press B
// (or the BUOY button) and click the water to lay a buoy (3 a day, 10c each);
// buoys near each other link into a glowing channel that speeds the boat +35%
// and halves storm damage inside it. A CHANNEL contract and a BUOY KIT upgrade
// track the new layer, on top of v2's contracts, fragile crates and escalating
// days. The game is this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html and its ES modules, no library
// and no network request).
// The program hands it in: it copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Screenshot scenes live behind ?shot=title|play|place|end (see shots.json);
// each stages the real rules forward from a seeded world and draws once.
// (?shot=upgrade still stages the between-days upgrade pick.)
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
