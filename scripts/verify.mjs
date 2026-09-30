// `pnpm verify`: does the code WORK? The husky `pre-push` hook runs it before
// every push (.husky/pre-push), so a commit that breaks the typing or the unit
// tests never leaves the machine. It can also be run by hand, at any time.
//
// WHAT IT RUNS. The checks of the CI `verify` job (.github/workflows/ci.yml)
// that decide whether the code works: the three typechecks and the unit
// tests. It goes through the package.json scripts, so that a command changed
// there changes here too. Eight of the nine CI failures between 27/09 and
// 30/09 were unit tests: that is the part that must not reach GitHub red.
//
// IN PARALLEL, because a slow hook ends up bypassed: about 55 s on four cores,
// against 105 s one after the other. Each check's output is held back and
// printed only if it fails, since four interleaved logs are unreadable.
//
// LEFT TO CI, on purpose (it re-runs everything after the push anyway):
// - `pnpm lint` (~80 s) and `pnpm format:check`: the pre-commit hook already
//   lints and formats every staged file (lint-staged.config.mjs);
// - `pnpm build` (~60 s): it also rewrites `.next/`, under a `pnpm dev` that
//   may be running;
// - the shuffled-order run and `pnpm audit`, which can go red for a reason
//   that is not in the pushed code.

import { spawn } from 'node:child_process';

// Named after the steps of the CI `verify` job: a red line here points at the
// same step there.
const CHECKS = [
  { name: 'Typecheck (application)', script: 'typecheck' },
  { name: 'Typecheck (backend Convex)', script: 'typecheck:convex' },
  { name: 'Typecheck (tests)', script: 'typecheck:tests' },
  { name: 'Tests unitaires', script: 'test' },
];

const seconds = (since) => Math.round((Date.now() - since) / 1000);

function run({ name, script }) {
  const started = Date.now();
  return new Promise((resolve) => {
    let output = '';
    let settled = false;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      console.log(`  ${ok ? '✓' : '✗'} ${name} (${seconds(started)} s)`);
      resolve({ name, ok, output });
    };

    const child = spawn('pnpm', ['run', '--silent', script], {
      // stdin is not the checks' business: in the pre-push hook it carries
      // the list of pushed refs.
      stdio: ['ignore', 'pipe', 'pipe'],
      // pnpm is a `.cmd` shim on Windows: only a shell resolves it.
      shell: process.platform === 'win32',
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    // `pnpm` missing from the PATH: said as is, not as a stack trace.
    child.on('error', (error) => {
      output += `${error.message}\n`;
      settle(false);
    });
    child.on('close', (code, signal) => {
      // A process killed from outside (out of memory, most often) leaves no
      // output of its own: without this line, the failure would be blank.
      if (signal) output += `\n(arrêté par ${signal})`;
      settle(code === 0);
    });
  });
}

const started = Date.now();
console.log(
  'Vérification : typage (application, backend Convex, tests) et tests unitaires, en parallèle…',
);
const results = await Promise.all(CHECKS.map(run));
const failures = results.filter((result) => !result.ok);

for (const { name, output } of failures) {
  console.log(`\n──── ${name} ────\n${output.trim() || '(aucune sortie)'}`);
}

if (failures.length === 0) {
  console.log(
    `\n✓ Les ${results.length} vérifications passent (${seconds(started)} s).`,
  );
} else {
  console.log(
    `\n✗ ${failures.length} vérification(s) sur ${results.length} en échec.`,
  );
  process.exitCode = 1;
}
