#!/usr/bin/env node
// tests/evals/open-all-evals.mjs
// Phase 6 batch eval PR opener (no waiting for CI or review).
//
// Opens all eval PRs as fast as possible (2-second gap between pushes to avoid
// GitHub secondary rate limits). Writes docs/results/phase-6-evals-tracking.json.
//
// When every PR has a bob-review comment, run:
//   node tests/evals/score-evals.mjs --close
//
// Usage:
//   node tests/evals/open-all-evals.mjs                     (all 30 cases, 1 rep each)
//   node tests/evals/open-all-evals.mjs --reps 3            (3 reps per case)
//   node tests/evals/open-all-evals.mjs --only ev01         (single case by prefix)
//   node tests/evals/open-all-evals.mjs --set train         (train set only)
//   node tests/evals/open-all-evals.mjs --set held-out      (held-out set only)

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CASES    = join(ROOT, 'tests', 'evals', 'cases');
const EXPECTED = JSON.parse(readFileSync(join(ROOT, 'tests', 'evals', 'expected.json'), 'utf8'));
const OUT      = join(ROOT, 'docs', 'results');
const REPO     = process.env.E2E_REPO || 'paolob67/notes-sandbox';
const TRACK    = join(OUT, 'phase-6-evals-tracking.json');

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function run(cmd, args, { input, cwd } = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', input, cwd, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
const gh      = (args, input) => run('gh', args, { input });
const apiBody = (method, path, body) => JSON.parse(gh(['api', '-X', method, path, '--input', '-'], JSON.stringify(body)));

let work = null;
const git = (...args) => run('git', args, { cwd: work });

function prepareClone() {
  work = mkdtempSync(join(tmpdir(), 'ev-open-'));
  gh(['repo', 'clone', REPO, work, '--', '--quiet']);
  log(`Cloned ${REPO} to ${work}`);
}

function loadCases() {
  return readdirSync(CASES).filter((f) => f.endsWith('.js')).sort()
    .map((f) => ({ id: f.replace('.js', ''), content: readFileSync(join(CASES, f), 'utf8') }));
}

function openOnePR(c, rep) {
  const ts     = Date.now();
  const branch = `ev/${c.id}-rep${rep}-${ts}`;
  git('fetch', '-q', 'origin', 'main');
  git('checkout', '-q', '-B', branch, 'origin/main');
  git('clean', '-fd', '-q');

  const filename = `src/${c.id}.js`;
  const full = join(work, filename);
  mkdirSync(join(work, 'src'), { recursive: true });
  // Per-rep marker ensures a unique diff even if file content is the same across reps.
  writeFileSync(full, c.content + `\n// eval-rep: ${rep}\n`);

  git('add', '-A');
  // --no-verify bypasses IBM Vault Radar pre-commit hook that blocks eval fixture secrets.
  git('commit', '--no-verify', '-q', '-m', `eval: ${c.id} rep${rep}`);
  const sha = git('rev-parse', 'HEAD').trim();
  git('push', '--no-verify', '-q', '--force', 'origin', `${branch}:refs/heads/${branch}`);

  const pr = apiBody('POST', `repos/${REPO}/pulls`, {
    title: `eval: ${c.id} rep${rep}`,
    head: branch,
    base: 'main',
    body: `Automated eval case. Set: ${EXPECTED.cases[c.id]?.set ?? 'unknown'}. Flaw: see src/${c.id}.js.`,
  });
  return { pr: pr.number, sha, branch, url: pr.html_url, t0: ts };
}

async function main() {
  const args      = process.argv.slice(2);
  const only      = args.flatMap((a, i) => (a === '--only' ? [args[i + 1]] : []));
  const setFilter = args[args.indexOf('--set') + 1] ?? null;
  const repsArg   = args.findIndex((a) => a === '--reps');
  const REPS      = repsArg >= 0 ? parseInt(args[repsArg + 1], 10) : 1;

  let cases = loadCases();
  if (setFilter) cases = cases.filter((c) => EXPECTED.cases[c.id]?.set === setFilter);
  if (only.length > 0) cases = cases.filter((c) => only.some((o) => c.id.startsWith(o)));
  if (cases.length === 0) { log('No cases to open.'); process.exit(0); }

  log(`Opening ${cases.length} case(s) x ${REPS} rep(s) = ${cases.length * REPS} PRs total.`);
  log('Does NOT wait for CI or reviews. When all PRs are commented, run:');
  log('  node tests/evals/score-evals.mjs --close');

  gh(['auth', 'status']);
  gh(['variable', 'set', 'BOB_REVIEW_ENABLED', '-R', REPO, '--body', 'true']);
  log('Kill switch: ON');
  prepareClone();

  // Load or start fresh tracking.
  let tracking = { date: new Date().toISOString(), repo: REPO, reps: REPS, prs: [] };
  if (existsSync(TRACK)) {
    try { tracking = JSON.parse(readFileSync(TRACK, 'utf8')); } catch { /* start fresh */ }
    tracking.date = new Date().toISOString();
  }

  for (const c of cases) {
    for (let rep = 1; rep <= REPS; rep++) {
      log(`  ${c.id} rep${rep} ...`);
      try {
        const p = openOnePR(c, rep);
        tracking.prs.push({
          id: c.id, rep, pr: p.pr, sha: p.sha, branch: p.branch,
          url: p.url, t0: p.t0, set: EXPECTED.cases[c.id]?.set ?? 'unknown', done: false,
        });
        log(`    -> PR #${p.pr} ${p.url}`);
      } catch (err) {
        log(`    ERROR: ${err.message.slice(0, 120)}`);
        tracking.prs.push({
          id: c.id, rep, pr: null, branch: null, url: null,
          t0: Date.now(), set: EXPECTED.cases[c.id]?.set ?? 'unknown', done: false,
          error: err.message.slice(0, 120),
        });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(TRACK, JSON.stringify(tracking, null, 2) + '\n');

  if (work) rmSync(work, { recursive: true, force: true });

  log('');
  log(`=== All PRs opened. Tracking saved to ${TRACK}`);
  log('');
  log(`${'CASE'.padEnd(35)} ${'REP'.padEnd(4)} ${'SET'.padEnd(10)} ${'PR#'.padEnd(6)} URL`);
  for (const p of tracking.prs) {
    log(`${p.id.padEnd(35)} ${String(p.rep).padEnd(4)} ${(p.set ?? '').padEnd(10)} ${String(p.pr ?? 'ERR').padEnd(6)} ${p.url ?? p.error ?? ''}`);
  }
  log('');
  log(`Watch: https://github.com/${REPO}/pulls`);
  log('When EVERY PR above has a bob-review comment, run:');
  log('  node tests/evals/score-evals.mjs --close');
}

main().catch((err) => { console.error(`[open-all-evals] ${err.message}`); process.exit(1); });
