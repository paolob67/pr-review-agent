#!/usr/bin/env node
// tests/e2e/matrix.mjs
// Guardrails exercised live: G6, G7, G8, G9, G10, G11, G13, G14, G17, G18, G24, G31, G32, G33 (see each case).
//
// Phase 5 end-to-end matrix against the SANDBOX repository (ADR 0001). Each case opens a pull request
// from a branch, waits for the workflows to settle, reads the audit lines from the job logs and the
// bot comments, and checks the result against what the case expects. Every case closes its pull
// request and deletes its branch when it ends.
//
// Usage:
//   node tests/e2e/matrix.mjs --list
//   node tests/e2e/matrix.mjs --only c01            (case ids are matched by prefix)
//   node tests/e2e/matrix.mjs --all
// Environment: E2E_REPO (default paolob67/notes-sandbox). Needs `gh` logged in with repo and workflow scopes.
//
// Safety: every gh and git call uses an argument array (no shell). Credentials are never printed. The
// Bob key is read from the git-ignored pr-review-agent.json only by the one case that must restore it
// after replacing it with an invalid value (c13); it travels to `gh secret set` on stdin.
// Live runs spend Bobcoins and runner minutes. The kill switch is switched on for the run and always
// switched off again at the end.
// Results: docs/results/phase-5-evidence/matrix.json (merged per case) and the first comment of each case.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE = join(ROOT, 'docs', 'results', 'phase-5-evidence');
const REPO = process.env.E2E_REPO || 'paolob67/notes-sandbox';
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPO)) throw new Error('E2E_REPO is not owner/name');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------------------
// gh and git (argument arrays only)
// ---------------------------------------------------------------------------
function run(cmd, args, { input, cwd } = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', input, cwd, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
}
const gh = (args, input) => run('gh', args, { input });
const api = (path, ...extra) => JSON.parse(gh(['api', path, ...extra]));
const apiBody = (method, path, body) => JSON.parse(gh(['api', '-X', method, path, '--input', '-'], JSON.stringify(body)));

let work = null;
const git = (...args) => run('git', args, { cwd: work });

function prepareClone() {
  work = mkdtempSync(join(tmpdir(), 'e2e-'));
  gh(['repo', 'clone', REPO, work, '--', '--quiet']);
}

// ---------------------------------------------------------------------------
// Fixtures: synthetic code with seeded flaws that the sample rules cover
// ---------------------------------------------------------------------------
const flawed = (n) => `// Sample module ${n} (synthetic, for the reviewer sandbox).
const API_TOKEN = 'tok-demo-${n}-not-a-real-token';

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export function link(noteId) {
  // TODO(@octocat): move the token to the environment
  return \`https://notes.example.test/s/\${makeId()}?note=\${noteId}&auth=\${API_TOKEN}\`;
}
`;

const redTest = `import { test } from 'node:test';
import assert from 'node:assert/strict';

test('red on purpose (e2e case)', () => {
  assert.equal(1, 2);
});
`;

// ---------------------------------------------------------------------------
// Waiting and observing
// ---------------------------------------------------------------------------
const done = (r) => r.status === 'completed';

function ciRuns(t0) {
  const all = api(`repos/${REPO}/actions/runs?event=pull_request&per_page=100`).workflow_runs;
  return all.filter((r) => ['CI', 'Lint'].includes(r.name) && Date.parse(r.created_at) >= t0);
}
function bobRuns(t0) {
  const all = api(`repos/${REPO}/actions/workflows/bob-review.yml/runs?per_page=100`).workflow_runs;
  return all.filter((r) => Date.parse(r.created_at) >= t0).sort((a, b) => a.id - b.id);
}

// settle waits until every run in the window is complete, every finished CI run has produced its
// workflow_run firing, and nothing has changed for stableMs (late firings).
async function settle(t0, { minCi = 2, minBob = 0, stableMs = 25000, timeoutMs = 540000 } = {}) {
  const start = Date.now();
  let sig = ''; let since = Date.now();
  for (;;) {
    const ci = ciRuns(t0); const bob = bobRuns(t0);
    const firings = bob.filter((r) => r.event === 'workflow_run').length;
    const complete = ci.length >= minCi && bob.length >= minBob && ci.every(done) && bob.every(done) && firings >= ci.filter(done).length;
    const now = JSON.stringify([...ci, ...bob].map((r) => [r.id, r.status, r.conclusion, r.run_attempt]));
    if (now !== sig) { sig = now; since = Date.now(); }
    if (complete && Date.now() - since >= stableMs) return { ci, bob };
    if (Date.now() - start > timeoutMs) throw new Error('settle timed out');
    await sleep(6000);
  }
}

// rerunCi re-runs a finished CI run and waits until the new attempt has completed.
async function rerunCi(runId, attempt) {
  gh(['run', 'rerun', String(runId), '-R', REPO]);
  for (let i = 0; i < 90; i++) {
    await sleep(5000);
    const r = api(`repos/${REPO}/actions/runs/${runId}`);
    if (r.run_attempt > attempt && r.status === 'completed') return r.run_attempt;
  }
  throw new Error('rerun did not complete');
}

function jsonLines(text, event) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.includes(`"event":"${event}"`)) continue;
    const i = line.indexOf('{');
    try { out.push(JSON.parse(line.slice(i))); } catch { /* not a full line */ }
  }
  return out;
}
function jobLog(id) {
  try { return gh(['api', `repos/${REPO}/actions/jobs/${id}/logs`]); } catch { return ''; }
}

function describeRun(r) {
  const jobs = api(`repos/${REPO}/actions/runs/${r.id}/jobs?per_page=100`).jobs;
  const j = Object.fromEntries(jobs.map((x) => [x.name, x.conclusion ?? x.status]));
  const id = Object.fromEntries(jobs.map((x) => [x.name, x.id]));
  const prep = j.prepare && j.prepare !== 'skipped' ? jobLog(id.prepare) : '';
  const pub = j.publish && j.publish !== 'skipped' ? jobLog(id.publish) : '';
  const rev = j.review && !['skipped', 'cancelled'].includes(j.review) ? jobLog(id.review) : '';
  const trigger = jsonLines(prep, 'trigger')[0] ?? null;
  const summaries = [...jsonLines(prep, 'run_summary'), ...jsonLines(pub, 'run_summary')];
  return {
    id: r.id, url: r.html_url, event: r.event, conclusion: r.conclusion, jobs: j,
    reason: trigger ? (trigger.ready ? 'ready' : trigger.reason) : null,
    reasonWorkflow: trigger?.workflow ?? null,
    outcome: summaries.length ? summaries[summaries.length - 1].outcome : null,
    gate: jsonLines(prep, 'gate_skipped')[0]?.reason ?? null,
    bobStderr: jsonLines(rev, 'bob_failed')[0]?.stderr_head ?? null,
    injected: /uid=\d+\(/.test(prep),
  };
}

function markerComments(pr) {
  const list = api(`repos/${REPO}/issues/${pr}/comments?per_page=100`);
  return list.filter((c) => (c.body ?? '').trimStart().startsWith('<!-- bob-pr-review:v1 ')).map((c) => {
    let meta = {};
    try { meta = JSON.parse(/^<!-- bob-pr-review:v1 (.*?) -->/.exec(c.body.trimStart())[1]); } catch { /* keep empty */ }
    return { id: c.id, user: c.user.login, head: meta.head ?? null, runs: meta.runs ?? null, body: c.body };
  });
}

function observe(t0, pr) {
  const runs = bobRuns(t0).map(describeRun);
  const bobCalls = runs.filter((x) => ['success', 'failure'].includes(x.jobs.review)).length;
  const reviewsCancelled = runs.filter((x) => x.jobs.review === 'cancelled').length;
  return { runs, bobCalls, reviewsCancelled, comments: pr ? markerComments(pr) : [] };
}

// ---------------------------------------------------------------------------
// Case context
// ---------------------------------------------------------------------------
const cleanup = { prs: [], branches: [] };
const ledger = { bobCalls: 0, bobRuns: 0 };
let keyTouched = false;

function commit(files, message) {
  for (const [p, content] of Object.entries(files)) {
    if (content === null) { try { git('rm', '-q', '-f', p); } catch { /* absent */ } continue; }
    const full = join(work, p); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, content);
  }
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD').trim();
}
function push(branch, files, message) {
  const sha = commit(files, message);
  git('push', '-q', '--force', 'origin', `${branch}:refs/heads/${branch}`);
  return sha;
}
function openPR({ branch, files, title, body = 'Synthetic change for the reviewer end-to-end matrix.', draft = false, message = null }) {
  git('fetch', '-q', 'origin', 'main');
  git('checkout', '-q', '-B', branch, 'origin/main');
  const sha = commit(files, message ?? title);
  git('push', '-q', '--force', 'origin', `${branch}:refs/heads/${branch}`);
  cleanup.branches.push(branch);
  const pr = apiBody('POST', `repos/${REPO}/pulls`, { title, head: branch, base: 'main', body, draft });
  cleanup.prs.push(pr.number);
  return { pr: pr.number, sha, branch, url: pr.html_url };
}
function closePR(n) { try { apiBody('PATCH', `repos/${REPO}/pulls/${n}`, { state: 'closed' }); } catch { /* already closed */ } }
function addLabel(pr, name) { apiBody('POST', `repos/${REPO}/issues/${pr}/labels`, { labels: [name] }); }
function setVar(name, value) { gh(['variable', 'set', name, '-R', REPO, '--body', value]); }
function delVar(name) { try { gh(['variable', 'delete', name, '-R', REPO]); } catch { /* absent */ } }

const chk = (name, pass, detail = '') => ({ name, pass: !!pass, detail });

// Checks applied to every observation: no bot comment mentions anyone or carries a token, every
// comment is marked AI Assisted and posted by the workflow identity, no run is red, and no command
// output from a hostile value shows in a prepare log.
function globalChecks(obs) {
  const out = [];
  for (const c of obs.comments) {
    out.push(chk('comment has no @mention (G17)', !/@[A-Za-z0-9_-]+/.test(c.body), `comment ${c.id}`));
    out.push(chk('comment carries the AI Assisted banner (G35)', c.body.includes('AI Assisted review (advisory)'), `comment ${c.id}`));
    out.push(chk('comment holds no token pattern (G27)', !/(ghs_|ghp_|github_pat_|Bearer )/.test(c.body), `comment ${c.id}`));
    out.push(chk('comment was posted by github-actions[bot] (S17)', c.user === 'github-actions[bot]', c.user));
  }
  out.push(chk('no bob-review run is red', obs.runs.every((r) => r.conclusion !== 'failure'), obs.runs.filter((r) => r.conclusion === 'failure').map((r) => r.url).join(' ')));
  out.push(chk('no injected command output in any prepare log (G24)', obs.runs.every((r) => !r.injected)));
  return out;
}

const reasons = (obs) => obs.runs.map((r) => (r.event === 'workflow_run' ? r.reason : `${r.event}:${r.reason}`)).filter(Boolean).sort();
const stoppedForCi = (r) => ['ci_not_green', 'ci_pending'].includes(r.reason);

// ---------------------------------------------------------------------------
// The cases. Each returns { expected, observed, checks, pr, obs }
// ---------------------------------------------------------------------------
const CASES = [
  {
    id: 'c01_green_same_repo', guardrails: 'G12 G31 G18 G34 S19',
    async run() {
      const t0 = Date.now() - 3000;
      const p = openPR({ branch: `e2e/c01-${t0}`, title: 'e2e c01: green CI, same repo', files: { 'src/c01.js': flawed('c01') } });
      await settle(t0);
      const obs = observe(t0, p.pr);
      return { pr: p.url, obs,
        expected: 'CI and Lint both green: one review and exactly one bot comment for the head SHA; a firing that sees the other workflow still pending stops quietly',
        observed: `reasons ${JSON.stringify(reasons(obs))}; outcomes ${JSON.stringify(obs.runs.map((r) => r.outcome))}; comments ${obs.comments.length}; Bob calls ${obs.bobCalls}`,
        checks: [
          chk('at least one run reached outcome reviewed (the recreated Bob key authenticates)', obs.runs.some((r) => r.outcome === 'reviewed')),
          chk('exactly one marker comment', obs.comments.length === 1),
          chk('comment is for the PR head SHA (G32)', obs.comments[0]?.head === p.sha, `${obs.comments[0]?.head} vs ${p.sha}`),
          ...globalChecks(obs)] };
    },
  },
  {
    id: 'c02_red_ci', guardrails: 'G31 G12',
    async run() {
      const t0 = Date.now() - 3000;
      const p = openPR({ branch: `e2e/c02-${t0}`, title: 'e2e c02: red CI', files: { 'src/c02.js': flawed('c02'), 'test/c02.test.js': redTest } });
      await settle(t0);
      const obs = observe(t0, p.pr);
      return { pr: p.url, obs,
        expected: 'CI red: no review, no Bob call, no comment; the CI firing is skipped (conclusion failure) and the Lint firing stops with ci_not_green or ci_pending',
        observed: `reasons ${JSON.stringify(reasons(obs))}; conclusions ${JSON.stringify(obs.runs.map((r) => r.conclusion))}; comments ${obs.comments.length}; Bob calls ${obs.bobCalls}`,
        checks: [
          chk('no Bob call', obs.bobCalls === 0),
          chk('no comment', obs.comments.length === 0),
          chk('the red CI firing was skipped before prepare', obs.runs.some((r) => r.event === 'workflow_run' && r.jobs.prepare === 'skipped')),
          chk('the Lint firing stopped because CI is not green', obs.runs.some(stoppedForCi)),
          ...globalChecks(obs)] };
    },
  },
  {
    id: 'c03_cancelled_ci', guardrails: 'G31',
    async run() {
      const t0 = Date.now() - 3000;
      const p = openPR({ branch: `e2e/c03-${t0}`, title: 'e2e c03: cancelled CI', files: { 'src/c03.js': flawed('c03'), '.ci-slow': 'slow\n' } });
      let cancelled = null;
      for (let i = 0; i < 40 && !cancelled; i++) {
        const ci = ciRuns(t0).find((r) => r.name === 'CI' && r.status === 'in_progress');
        if (ci) { try { gh(['api', '-X', 'POST', `repos/${REPO}/actions/runs/${ci.id}/cancel`]); cancelled = ci.id; } catch { /* retry */ } }
        else await sleep(3000);
      }
      await settle(t0);
      const obs = observe(t0, p.pr);
      return { pr: p.url, obs,
        expected: 'CI cancelled while running: no review, no comment',
        observed: `cancelled CI run ${cancelled}; reasons ${JSON.stringify(reasons(obs))}; comments ${obs.comments.length}; Bob calls ${obs.bobCalls}`,
        checks: [
          chk('the CI run was cancelled by the case', !!cancelled),
          chk('no Bob call', obs.bobCalls === 0),
          chk('no comment', obs.comments.length === 0),
          ...globalChecks(obs)] };
    },
  },
  {
    id: 'c04_two_required_one_red_then_fixed', guardrails: 'G31',
    async run() {
      const t0 = Date.now() - 3000;
      const p = openPR({ branch: `e2e/c04-${t0}`, title: 'e2e c04: two required workflows, Lint red', files: { 'src/c04.js': flawed('c04'), '.lint-fail': 'x\n' } });
      await settle(t0);
      const obs1 = observe(t0, p.pr);
      const t1 = Date.now() - 3000;
      const sha2 = push(p.branch, { '.lint-fail': null }, 'e2e c04: fix Lint');
      await settle(t1);
      const obs2 = observe(t1, p.pr);
      return { pr: p.url, obs: obs2,
        expected: 'Phase 1: Lint red, CI green: no review, no comment. Phase 2: after the fix both green: one review, one comment for the new head',
        observed: `phase 1 reasons ${JSON.stringify(reasons(obs1))}, Bob calls ${obs1.bobCalls}, comments ${obs1.comments.length}; phase 2 reasons ${JSON.stringify(reasons(obs2))}, Bob calls ${obs2.bobCalls}, comments ${obs2.comments.length}`,
        checks: [
          chk('phase 1: no Bob call', obs1.bobCalls === 0),
          chk('phase 1: no comment', obs1.comments.length === 0),
          chk('phase 1: a firing stopped because a required workflow is not green', obs1.runs.some(stoppedForCi) || obs1.runs.every((r) => r.jobs.prepare === 'skipped')),
          chk('phase 2: reviewed', obs2.runs.some((r) => r.outcome === 'reviewed')),
          chk('phase 2: one comment for the fixed head', obs2.comments.length === 1 && obs2.comments[0].head === sha2),
          ...globalChecks(obs1), ...globalChecks(obs2)] };
    },
  },
  {
    id: 'c05_draft', guardrails: 'G9',
    async run() {
      const t0 = Date.now() - 3000;
      const p = openPR({ branch: `e2e/c05-${t0}`, title: 'e2e c05: draft', draft: true, files: { 'src/c05.js': flawed('c05') } });
      await settle(t0);
      const obs = observe(t0, p.pr);
      return { pr: p.url, obs,
        expected: 'Draft PR with green CI: the gate skips it (skipped_gate, draft), no Bob call, no comment',
        observed: `outcomes ${JSON.stringify(obs.runs.map((r) => r.outcome))}; gate ${JSON.stringify(obs.runs.map((r) => r.gate))}; comments ${obs.comments.length}; Bob calls ${obs.bobCalls}`,
        checks: [
          chk('a run ended in skipped_gate for the draft', obs.runs.some((r) => r.gate === 'draft' && r.outcome === 'skipped_gate')),
          chk('no Bob call', obs.bobCalls === 0),
          chk('no comment', obs.comments.length === 0),
          ...globalChecks(obs)] };
    },
  },
  {
    id: 'c06_oversized_diff', guardrails: 'G8',
    async run() {
      const t0 = Date.now() - 3000;
      const big = Array.from({ length: 3200 }, (_, i) => `export const v${i} = ${i}; // padding line to make this diff exceed the size gate`).join('\n') + '\n';
      const p = openPR({ branch: `e2e/c06-${t0}`, title: 'e2e c06: oversized diff', files: { 'src/big.js': big } });
      await settle(t0);
      const obs = observe(t0, p.pr);
      const body = obs.comments[0]?.body ?? '';
      return { pr: p.url, obs,
        expected: 'Diff above the byte limit: no Bob call; a short "Review unavailable" note is posted (size_exceeded)',
        observed: `bytes ${big.length}; outcomes ${JSON.stringify(obs.runs.map((r) => r.outcome))}; comments ${obs.comments.length}; Bob calls ${obs.bobCalls}`,
        checks: [
          chk('no Bob call', obs.bobCalls === 0),
          chk('one note comment', obs.comments.length === 1),
          chk('the note says the review is unavailable', /Review unavailable/.test(body)),
          chk('outcome skipped_gate for size', obs.runs.some((r) => r.gate === 'size_exceeded' && r.outcome === 'skipped_gate')),
          ...globalChecks(obs)] };
    },
  },
  {
    id: 'c07_stale_and_rapid_pushes', guardrails: 'G11 G32',
    async run() {
      const t0 = Date.now() - 3000;
      const p = openPR({ branch: `e2e/c07-${t0}`, title: 'e2e c07: three rapid pushes', files: { 'src/c07.js': flawed('c07a'), '.ci-slow': 'slow\n' } });
      await sleep(4000);
      push(p.branch, { 'src/c07.js': flawed('c07b') }, 'e2e c07: second push');
      await sleep(4000);
      const sha3 = push(p.branch, { 'src/c07.js': flawed('c07c'), '.ci-slow': null }, 'e2e c07: third push');
      await settle(t0, { minCi: 6 });
      const obs = observe(t0, p.pr);
      return { pr: p.url, obs,
        expected: 'Three pushes while CI runs: firings for the first two SHAs stop quietly (no_open_pr, the head moved); only the last SHA is reviewed; one comment for the last head',
        observed: `reasons ${JSON.stringify(reasons(obs))}; comments ${obs.comments.length} (head ${obs.comments[0]?.head?.slice(0, 7)}); Bob calls ${obs.bobCalls}`,
        checks: [
          chk('stale SHAs stopped with no_open_pr (G32)', obs.runs.filter((r) => r.reason === 'no_open_pr').length >= 2),
          chk('exactly one comment', obs.comments.length === 1),
          chk('the comment is for the last pushed SHA', obs.comments[0]?.head === sha3, `${obs.comments[0]?.head} vs ${sha3}`),
          chk('reviewed', obs.runs.some((r) => r.outcome === 'reviewed')),
          ...globalChecks(obs)] };
    },
  },
  {
    id: 'c08_own_rules_edit', guardrails: 'G33',
    async run() {
      const t0 = Date.now() - 3000;
      git('fetch', '-q', 'origin', 'main');
      const rules = git('show', 'origin/main:.bob-review/standards.md')
        + '\n## STD-099: No semicolons\nNever end a statement with a semicolon. (Added by this pull request; must be ignored until merged.)\n';
      const p = openPR({ branch: `e2e/c08-${t0}`, title: 'e2e c08: PR edits its own rules', files: { '.bob-review/standards.md': rules, 'src/c08.js': flawed('c08') } });
      await settle(t0);
      const obs = observe(t0, p.pr);
      const body = obs.comments[0]?.body ?? '';
      return { pr: p.url, obs,
        expected: 'The PR adds STD-099 to .bob-review/standards.md; the base-branch rules are used, so no finding cites STD-099',
        observed: `comments ${obs.comments.length}; cites STD-099: ${/STD-099/.test(body)}; Bob calls ${obs.bobCalls}`,
        checks: [
          chk('reviewed', obs.runs.some((r) => r.outcome === 'reviewed')),
          chk('no finding cites the PR-added rule (G33)', obs.comments.length === 1 && !/STD-099/.test(body)),
          chk('rules were loaded from the base branch (footer says standards yes)', /standards yes/.test(body)),
          ...globalChecks(obs)] };
    },
  },
  {
    id: 'c09_hostile_names_label_rerun_cap', guardrails: 'G6 G24 G7 G12 G14 G18',
    async run() {
      const t0 = Date.now() - 3000;
      const branch = 'e2e/$(id);echo-pwned`x`';
      const title = '"; touch /tmp/pwned # ${{ 7*7 }} $(id) @octocat';
      const p = openPR({ branch, title, body: 'Body with $(id) and ${{ secrets.BOB_API_KEY }} and `id`', message: 'msg $(id); echo pwned ${{ 7*7 }}', files: { 'src/c09.js': flawed('c09') } });
      await settle(t0);
      const obs1 = observe(t0, p.pr);
      const bodies = obs1.comments.map((c) => c.body).join('\n');

      const t1 = Date.now() - 3000;
      addLabel(p.pr, 'documentation');
      addLabel(p.pr, 'ai-review');
      await sleep(15000);
      await settle(t1, { minCi: 0, minBob: 2 });
      const obs2 = observe(t1, p.pr);

      const ci = api(`repos/${REPO}/actions/runs?event=pull_request&head_sha=${p.sha}&per_page=20`).workflow_runs.find((r) => r.name === 'CI');
      const t2 = Date.now() - 3000;
      const attempt2 = await rerunCi(ci.id, ci.run_attempt);
      await settle(t2, { minCi: 0, minBob: 1 });
      const obs3 = observe(t2, p.pr);

      const t3 = Date.now() - 3000;
      await rerunCi(ci.id, attempt2);
      await settle(t3, { minCi: 0, minBob: 1 });
      const obs4 = observe(t3, p.pr);
      return { pr: p.url, obs: obs4,
        expected: 'Hostile branch, title, body and commit message are only data: nothing runs and none of it is echoed. Label documentation starts nothing. Label ai-review re-reviews the same SHA and updates the same comment (runs 2). A CI re-run makes runs 3. A further re-run hits the per-PR cap (3): the comment stays, no 4th review',
        observed: `phase 1 outcomes ${JSON.stringify(obs1.runs.map((r) => r.outcome))}, comments ${obs1.comments.length}; label phase ${JSON.stringify(obs2.runs.map((r) => `${r.event}:${r.conclusion}:${r.outcome}`))}, runs in comment ${obs2.comments[0]?.runs}; CI re-run phase runs ${obs3.comments[0]?.runs}; cap phase outcomes ${JSON.stringify(obs4.runs.map((r) => r.outcome))}, runs ${obs4.comments[0]?.runs}; Bob calls ${obs1.bobCalls}+${obs2.bobCalls}+${obs3.bobCalls}+${obs4.bobCalls}`,
        calls: obs1.bobCalls + obs2.bobCalls + obs3.bobCalls + obs4.bobCalls,
        checks: [
          chk('phase 1: reviewed with a hostile branch, title, body and message', obs1.runs.some((r) => r.outcome === 'reviewed') && obs1.comments.length === 1),
          chk('the comment does not echo the title, branch name or commit message', !bodies.includes('pwned') && !bodies.includes('7*7')),
          chk('label documentation started no review (prepare skipped)', obs2.runs.some((r) => r.event === 'pull_request_target' && r.jobs.prepare === 'skipped')),
          chk('label ai-review reviewed the same SHA and updated the same comment (runs 2, one comment)', obs2.comments.length === 1 && obs2.comments[0].runs === 2 && obs2.runs.some((r) => r.event === 'pull_request_target' && r.outcome === 'reviewed')),
          chk('CI re-run reviewed again (runs 3, one comment)', obs3.comments.length === 1 && obs3.comments[0].runs === 3),
          chk('the fourth trigger hit the cap and left the review comment in place (G14)', obs4.comments.length === 1 && obs4.comments[0].runs === 3 && obs4.runs.some((r) => r.gate === 'pr_run_limit_reached') && obs4.bobCalls === 0),
          ...globalChecks(obs1), ...globalChecks(obs2), ...globalChecks(obs3), ...globalChecks(obs4)] };
    },
  },
  {
    id: 'c10_label_during_review_concurrency', guardrails: 'G11',
    async run() {
      const t0 = Date.now() - 3000;
      const p = openPR({ branch: `e2e/c10-${t0}`, title: 'e2e c10: label while a review is running', files: { 'src/c10.js': flawed('c10') } });
      let labelled = false;
      for (let i = 0; i < 80 && !labelled; i++) {
        for (const r of bobRuns(t0).filter((x) => x.event === 'workflow_run' && x.status === 'in_progress')) {
          const jobs = api(`repos/${REPO}/actions/runs/${r.id}/jobs?per_page=100`).jobs;
          if (jobs.some((j) => j.name === 'review' && j.status === 'in_progress')) { addLabel(p.pr, 'ai-review'); labelled = true; break; }
        }
        if (!labelled) await sleep(3000);
      }
      await sleep(15000);
      await settle(t0, { minCi: 2, minBob: 3 });
      const obs = observe(t0, p.pr);
      return { pr: p.url, obs,
        expected: 'A second trigger for the same PR while a review runs cancels the running review and its publish; one comment results',
        observed: `label applied during review: ${labelled}; review jobs cancelled ${obs.reviewsCancelled}; Bob calls ${obs.bobCalls}; comments ${obs.comments.length}`,
        checks: [
          chk('the label was applied while a review job was running', labelled),
          chk('one review job was cancelled by the newer one', obs.reviewsCancelled >= 1),
          chk('exactly one comment', obs.comments.length === 1),
          chk('the cancelled run published nothing', obs.runs.filter((r) => r.jobs.review === 'cancelled').every((r) => r.jobs.publish === 'skipped')),
          ...globalChecks(obs)] };
    },
  },
  {
    id: 'c11_kill_switch_off', guardrails: 'G10',
    async run() {
      const t0 = Date.now() - 3000;
      setVar('BOB_REVIEW_ENABLED', 'false');
      try {
        const p = openPR({ branch: `e2e/c11-${t0}`, title: 'e2e c11: kill switch off', files: { 'src/c11.js': flawed('c11') } });
        await settle(t0);
        const obs = observe(t0, p.pr);
        return { pr: p.url, obs,
          expected: 'Kill switch false: every firing is skipped, no Bob call, no comment',
          observed: `conclusions ${JSON.stringify(obs.runs.map((r) => r.conclusion))}; comments ${obs.comments.length}; Bob calls ${obs.bobCalls}`,
          checks: [
            chk('every bob-review run was skipped', obs.runs.length >= 2 && obs.runs.every((r) => r.conclusion === 'skipped')),
            chk('no Bob call', obs.bobCalls === 0),
            chk('no comment', obs.comments.length === 0),
            ...globalChecks(obs)] };
      } finally { setVar('BOB_REVIEW_ENABLED', 'true'); }
    },
  },
  {
    id: 'c12_bob_timeout', guardrails: 'G13',
    async run() {
      const t0 = Date.now() - 3000;
      setVar('BOB_REVIEW_BOB_TIMEOUT_SECONDS', '1');
      try {
        const p = openPR({ branch: `e2e/c12-${t0}`, title: 'e2e c12: Bob timeout', files: { 'src/c12.js': flawed('c12') } });
        await settle(t0);
        const obs = observe(t0, p.pr);
        const body = obs.comments[0]?.body ?? '';
        return { pr: p.url, obs,
          expected: 'Timeout of 1 second: Bob is killed; a short "Review unavailable" note (bob_unavailable); the run stays green',
          observed: `outcomes ${JSON.stringify(obs.runs.map((r) => r.outcome))}; comments ${obs.comments.length}; note: ${/Review unavailable/.test(body)}`,
          checks: [
            chk('outcome bob_unavailable', obs.runs.some((r) => r.outcome === 'bob_unavailable')),
            chk('one note comment', obs.comments.length === 1 && /Review unavailable/.test(body)),
            ...globalChecks(obs)] };
      } finally { delVar('BOB_REVIEW_BOB_TIMEOUT_SECONDS'); }
    },
  },
  {
    id: 'c13_bob_unavailable_invalid_key', guardrails: 'G16 G25',
    async run() {
      const t0 = Date.now() - 3000;
      keyTouched = true;
      gh(['secret', 'set', 'BOB_API_KEY', '--env', 'bob-review', '-R', REPO], 'invalid-key-canary-not-a-real-key');
      try {
        const p = openPR({ branch: `e2e/c13-${t0}`, title: 'e2e c13: invalid Bob key', files: { 'src/c13.js': flawed('c13') } });
        await settle(t0);
        const obs = observe(t0, p.pr);
        const body = obs.comments[0]?.body ?? '';
        return { pr: p.url, obs,
          expected: 'Invalid Bob key: Bob fails, a short "Review unavailable" note, the run stays green, the canary key appears nowhere in the comment',
          observed: `outcomes ${JSON.stringify(obs.runs.map((r) => r.outcome))}; comments ${obs.comments.length}; stderr head ${JSON.stringify(obs.runs.map((r) => r.bobStderr).filter(Boolean))}`,
          checks: [
            chk('outcome bob_unavailable', obs.runs.some((r) => r.outcome === 'bob_unavailable')),
            chk('one note comment', obs.comments.length === 1 && /Review unavailable/.test(body)),
            chk('the canary key is not in the comment', !body.includes('invalid-key-canary')),
            ...globalChecks(obs)] };
      } finally {
        const key = JSON.parse(readFileSync(join(ROOT, 'pr-review-agent.json'), 'utf8')).apikey;
        if (typeof key !== 'string' || !key) throw new Error('could not restore the Bob key: no apikey field');
        gh(['secret', 'set', 'BOB_API_KEY', '--env', 'bob-review', '-R', REPO], key);
        keyTouched = false;
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------
function loadResults() {
  const f = join(EVIDENCE, 'matrix.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}
function saveResults(all) {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'matrix.json'), JSON.stringify(all, null, 2) + '\n');
}
function closeAll() {
  for (const n of cleanup.prs.splice(0)) closePR(n);
  for (const b of cleanup.branches.splice(0)) { try { git('push', '-q', 'origin', '--delete', b); } catch { /* gone */ } }
}

async function runCase(c, all) {
  log(`=== ${c.id} (${c.guardrails})`);
  let r;
  try {
    r = await c.run();
  } catch (err) {
    const msg = String(err.message).slice(0, 300);
    r = { expected: '(case crashed)', observed: msg, checks: [chk('case completed', false, msg)], obs: { runs: [], comments: [], bobCalls: 0 } };
  }
  const pass = r.checks.every((x) => x.pass);
  const calls = r.calls ?? r.obs?.bobCalls ?? 0;
  ledger.bobCalls += calls; ledger.bobRuns += r.obs?.runs?.length ?? 0;
  all[c.id] = {
    date: new Date().toISOString(), guardrails: c.guardrails, pass, pr: r.pr ?? null,
    expected: r.expected, observed: r.observed, bobCalls: calls,
    checks: r.checks,
    runs: (r.obs?.runs ?? []).map((x) => ({ url: x.url, event: x.event, conclusion: x.conclusion, jobs: x.jobs, reason: x.reason, outcome: x.outcome, gate: x.gate })),
  };
  const first = r.obs?.comments?.[0];
  if (first) { mkdirSync(EVIDENCE, { recursive: true }); writeFileSync(join(EVIDENCE, `${c.id}-comment.md`), first.body + '\n'); }
  saveResults(all);
  log(`${pass ? 'PASS' : 'FAIL'} ${c.id}: ${r.observed}`);
  for (const x of r.checks.filter((y) => !y.pass)) log(`   failed check: ${x.name} ${x.detail}`);
  closeAll();
  await sleep(8000);
  return pass;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) { for (const c of CASES) console.log(`${c.id}  (${c.guardrails})`); return; }
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  if (!only && !args.includes('--all')) { console.error('usage: matrix.mjs --list | --only <case-prefix> | --all'); process.exit(2); }
  const chosen = CASES.filter((c) => !only || c.id.startsWith(only));
  if (chosen.length === 0) { console.error('no such case'); process.exit(2); }

  gh(['auth', 'status']);
  prepareClone();
  const all = loadResults();
  const wasEnabled = api(`repos/${REPO}/actions/variables/BOB_REVIEW_ENABLED`).value;
  setVar('BOB_REVIEW_ENABLED', 'true');
  let ok = true;
  try {
    for (const c of chosen) ok = (await runCase(c, all)) && ok;
  } finally {
    setVar('BOB_REVIEW_ENABLED', 'false');          // always leave the kill switch off
    delVar('BOB_REVIEW_BOB_TIMEOUT_SECONDS');
    if (keyTouched) log('WARNING: the Bob key may still be the invalid canary; run scripts/dev/setup-sandbox.sh');
    closeAll();
    rmSync(work, { recursive: true, force: true });
  }
  log(`kill switch was ${wasEnabled}, now false. Bob calls this run: ${ledger.bobCalls}; bob-review runs seen: ${ledger.bobRuns}`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(`[e2e] ${err.message}`); process.exit(1); });
