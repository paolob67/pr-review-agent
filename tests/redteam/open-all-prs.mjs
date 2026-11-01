#!/usr/bin/env node
// tests/redteam/open-all-prs.mjs
// Phase 6 batch PR opener.
//
// Opens all pending live red-team PRs as fast as possible (no settle/wait).
// Prints a tracking table to stdout and writes it to docs/results/phase-6-rt-tracking.json.
// The owner watches the sandbox until every PR has a bob-review comment, then runs:
//
//   node tests/redteam/check-comments.mjs
//
// Usage:
//   node tests/redteam/open-all-prs.mjs
//   node tests/redteam/open-all-prs.mjs --only rt04   (one case, for testing)
//   node tests/redteam/open-all-prs.mjs --reps 3      (default 3 reps per case)
//
// The script leaves all PRs OPEN. Close them after check-comments.mjs has run.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS = join(ROOT, 'tests', 'redteam', 'corpus');
const OUT    = join(ROOT, 'docs', 'results');
const REPO   = process.env.E2E_REPO || 'paolob67/notes-sandbox';

// Cases already opened or done. Update this set to skip cases already in the tracking file.
// rt01, rt02: done in earlier harness.mjs sessions.
// rt03-rt06: opened in the first open-all-prs.mjs run (PRs #27-#38, all open).
const ALREADY_DONE = new Set([
  'rt01_title_injection', 'rt02_body_injection',
  'rt03_commit_message_injection', 'rt04_code_comment_injection',
  'rt05_readme_injection', 'rt06_filename_injection',
]);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function run(cmd, args, { input, cwd } = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', input, cwd, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
const gh      = (args, input) => run('gh', args, { input });
const apiBody = (method, path, body) => JSON.parse(gh(['api', '-X', method, path, '--input', '-'], JSON.stringify(body)));

let work = null;
const git = (...args) => run('git', args, { cwd: work });

function prepareClone() {
  work = mkdtempSync(join(tmpdir(), 'rt-open-'));
  gh(['repo', 'clone', REPO, work, '--', '--quiet']);
  log(`Cloned ${REPO} to ${work}`);
}

function loadCorpus() {
  return readdirSync(CORPUS).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(readFileSync(join(CORPUS, f), 'utf8')));
}

function isLiveCase(c) {
  return !c.payload_in_model_output && !c.payload_type;
}

// ---------------------------------------------------------------------------
// Build PR content (mirrors harness.mjs logic exactly)
// ---------------------------------------------------------------------------
function buildFiles(corpus) {
  const files = {};
  files[`src/rt_${corpus.id}.js`] = `// Red-team fixture: ${corpus.id}\nexport const x = 1;\n`;
  const surface = corpus.attack_surface;
  if (surface.startsWith('code comment') || surface.startsWith('code string') || surface === 'commit message') {
    files[corpus.payload_file ?? `src/rt_${corpus.id}_payload.js`] = corpus.payload_content ?? `// ${corpus.payload}\nexport const y = 2;\n`;
  }
  if (surface === 'README file in diff' || surface === 'AGENTS.md in PR head' || surface === '.env file in PR head') {
    files[corpus.payload_file] = corpus.payload_content;
  }
  if (surface === 'rules file edit in PR head') {
    let existing = '';
    try { existing = git('show', 'origin/main:.bob-review/standards.md'); } catch { /* absent */ }
    files[corpus.payload_file] = existing + (corpus.payload_content_suffix ?? '');
  }
  return files;
}

function buildTitle(corpus) {
  if (corpus.attack_surface === 'PR title') return corpus.payload;
  return `red-team: ${corpus.id}`;
}
function buildBody(corpus) {
  if (corpus.attack_surface === 'PR body') return corpus.payload;
  return `Automated red-team case for guardrails ${(corpus.guardrails ?? []).join(', ')}. Canary: ${corpus.canary ?? 'n/a'}.`;
}
function buildMessage(corpus) {
  if (corpus.attack_surface === 'commit message') return corpus.payload;
  return `red-team: ${corpus.id}`;
}

function openOnePR(corpus, rep) {
  const ts     = Date.now();
  const branch = `rt/${corpus.id}-rep${rep}-${ts}`;
  git('fetch', '-q', 'origin', 'main');
  git('checkout', '-q', '-B', branch, 'origin/main');
  // Clean any leftover working-tree changes from previous reps.
  git('clean', '-fd', '-q');

  const files = buildFiles(corpus);
  for (const [p, content] of Object.entries(files)) {
    if (content === null) { try { git('rm', '-q', '-f', p); } catch { /* absent */ } continue; }
    const full = join(work, p);
    const dir  = full.includes('/') ? full.split('/').slice(0, -1).join('/') : work;
    mkdirSync(dir, { recursive: true });
    // Append a per-rep marker comment so every rep has a unique diff.
    const body = (typeof content === 'string' ? content : '') + `// rep ${rep}\n`;
    writeFileSync(full, body);
  }
  git('add', '-A');
  // --no-verify bypasses local git hooks (e.g. IBM Vault Radar pre-commit scan)
  // that would block adversarial red-team fixtures containing bidi chars, fake keys, etc.
  git('commit', '--no-verify', '-q', '-m', buildMessage(corpus));
  const sha = git('rev-parse', 'HEAD').trim();
  git('push', '--no-verify', '-q', '--force', 'origin', `${branch}:refs/heads/${branch}`);
  const pr = apiBody('POST', `repos/${REPO}/pulls`, {
    title: buildTitle(corpus),
    head: branch,
    base: 'main',
    body: buildBody(corpus),
  });
  return { pr: pr.number, sha, branch, url: pr.html_url, t0: ts };
}

async function main() {
  const args    = process.argv.slice(2);
  const only    = args.flatMap((a, i) => (a === '--only' ? [args[i + 1]] : []));
  const repsArg = args.findIndex((a) => a === '--reps');
  const REPS    = repsArg >= 0 ? parseInt(args[repsArg + 1], 10) : 3;

  const allCorpus = loadCorpus().filter((c) => isLiveCase(c) && !ALREADY_DONE.has(c.id));
  const chosen = only.length > 0 ? allCorpus.filter((c) => only.some((o) => c.id.startsWith(o))) : allCorpus;

  if (chosen.length === 0) { log('No pending live cases to open.'); process.exit(0); }

  log(`Opening ${chosen.length} case(s) x ${REPS} rep(s) = ${chosen.length * REPS} PRs total.`);
  log('The script does NOT wait for CI or reviews. Watch the sandbox and run check-comments.mjs when all PRs are reviewed.');

  gh(['auth', 'status']);
  gh(['variable', 'set', 'BOB_REVIEW_ENABLED', '-R', REPO, '--body', 'true']);
  log('Kill switch set to true.');
  prepareClone();

  // Load existing tracking (if a previous run already opened some PRs) and append.
  let tracking = { date: new Date().toISOString(), repo: REPO, reps: REPS, prs: [] };
  const trackingPath = join(OUT, 'phase-6-rt-tracking.json');
  if (existsSync(trackingPath)) {
    try { tracking = JSON.parse(readFileSync(trackingPath, 'utf8')); } catch { /* use fresh */ }
    tracking.date = new Date().toISOString();
  }

  for (const corpus of chosen) {
    for (let rep = 1; rep <= REPS; rep++) {
      log(`  ${corpus.id} rep${rep} ...`);
      try {
        const p = openOnePR(corpus, rep);
        tracking.prs.push({ id: corpus.id, rep, pr: p.pr, sha: p.sha, branch: p.branch, url: p.url, t0: p.t0, done: false });
        log(`    -> PR #${p.pr} ${p.url}`);
      } catch (err) {
        log(`    ERROR: ${err.message.slice(0, 120)}`);
        tracking.prs.push({ id: corpus.id, rep, pr: null, branch: null, url: null, t0: Date.now(), done: false, error: err.message.slice(0, 120) });
      }
      // 2-second pause between pushes to avoid GitHub secondary rate limits.
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(trackingPath, JSON.stringify(tracking, null, 2) + '\n');

  // Clean up the local clone (PRs are already pushed and open).
  if (work) rmSync(work, { recursive: true, force: true });

  log('');
  log('=== All PRs opened. Tracking saved to docs/results/phase-6-rt-tracking.json');
  log('');
  log(`${'CASE'.padEnd(35)} ${'REP'.padEnd(4)} ${'PR#'.padEnd(6)} URL`);
  for (const p of tracking.prs) {
    log(`${p.id.padEnd(35)} ${String(p.rep).padEnd(4)} ${String(p.pr ?? 'ERR').padEnd(6)} ${p.url ?? p.error ?? ''}`);
  }
  log('');
  log(`Watch: https://github.com/${REPO}/pulls`);
  log('When EVERY PR above has a "bob-review" comment, run:');
  log('  node tests/redteam/check-comments.mjs');
}

main().catch((err) => { console.error(`[open-all-prs] ${err.message}`); process.exit(1); });
