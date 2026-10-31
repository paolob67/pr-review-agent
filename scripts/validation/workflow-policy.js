#!/usr/bin/env node
// scripts/validation/workflow-policy.js
// Guardrails: G1 (no default token scopes), G6 (no PR code checkout), G13 (job timeouts),
//             G21 (job configuration), G22 (pinned runner and actions), G24 (no PR data in shell
//             strings), G25 (one credential per job), G34 (no review, check or status writes).
//
// Static policy check for the review workflow (ADR 0012, ADR 0013). It reads the workflow text line
// by line (no YAML dependency) and relies on the fixed shape of integrations/github-actions/*.yml:
// two-space indentation, `jobs:` at the top level, `steps:` under each job.
//
// Usage: node scripts/validation/workflow-policy.js [file ...]
// Default files: every .yml under integrations/github-actions/.
// Exit 0 when clean, 1 when any rule is violated.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Secrets a job may reference, and only in a step env: line. Everything else is a violation.
const ALLOWED_SECRETS = { review: ['BOB_API_KEY'], publish: ['BOB_COMMENT_TOKEN'] };
// Jobs that may use the bob-review environment.
const ENVIRONMENT_JOBS = ['review'];
// Job-level permissions each job may declare.
const ALLOWED_PERMISSIONS = {
  prepare: new Set(['contents: read', 'pull-requests: read', 'actions: read']),
  review: new Set([]),
  publish: new Set(['issues: write']),
};
const PINNED_RUNNER = /^ubuntu-24\.04$/;
const SHA_PIN = /@[0-9a-f]{40}(\s|$)/;
// PR-controlled context that must never be used anywhere in a workflow (G24).
const TAINTED = [
  /github\.head_ref/,
  /github\.event\.(pull_request|issue|comment|review|review_comment|head_commit|commits|discussion)\b/,
  /github\.event\.workflow_run\.(head_branch|head_commit|display_title|head_repository|pull_requests\[\d+\]\.(head|base))/,
];

const indentOf = (l) => l.length - l.trimStart().length;

// splitJobs returns [{ name, start, lines: [{ n, text }] }] where start is the 1-based line of the job key.
function splitJobs(lines) {
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt < 0) return [];
  const jobs = [];
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const m = /^  ([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (m) jobs.push({ name: m[1], start: i + 1, lines: [] });
    else if (/^\S/.test(lines[i])) break;
    else if (jobs.length) jobs[jobs.length - 1].lines.push({ n: i + 1, text: lines[i] });
  }
  return jobs;
}

// stepsOf groups a job's lines into steps (blocks starting with `- ` at the steps indent).
function stepsOf(job) {
  const at = job.lines.findIndex((l) => /^    steps:\s*$/.test(l.text));
  if (at < 0) return [];
  const steps = [];
  for (const l of job.lines.slice(at + 1)) {
    if (/^      - /.test(l.text)) steps.push([l]);
    else if (steps.length && (l.text.trim() === '' || indentOf(l.text) > 6)) steps[steps.length - 1].push(l);
  }
  return steps;
}

// runBodies returns, for each `run:` key, its lines (inline value or block scalar).
function runBodies(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i].text);
    if (!m) continue;
    const keyIndent = m[1].length;
    const body = [{ n: lines[i].n, text: m[2] }];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].text.trim() === '' || indentOf(lines[j].text) > keyIndent) body.push(lines[j]);
      else break;
    }
    out.push(body);
  }
  return out;
}

export function checkWorkflow(text) {
  const v = [];
  const add = (rule, n, msg) => v.push({ rule, line: n, msg });
  const lines = text.split('\n');
  const all = lines.map((t, i) => ({ n: i + 1, text: t }));

  // G1: the workflow starts with no permissions.
  if (!lines.some((l) => /^permissions:\s*\{\}\s*$/.test(l))) add('G1', 1, 'top-level `permissions: {}` is missing');

  // G24: tainted contexts anywhere; G25: no secrets inherit; G6: no pull_request_target yet.
  for (const l of all) {
    if (l.text.trimStart().startsWith('#')) continue;
    for (const re of TAINTED) if (re.test(l.text)) add('G24', l.n, `PR-controlled context used: ${l.text.trim()}`);
    if (/^\s*secrets:\s*inherit\s*$/.test(l.text)) add('G25', l.n, '`secrets: inherit` is not allowed');
    if (/^\s*pull_request_target\s*:/.test(l.text)) add('G6', l.n, 'pull_request_target is Phase 5 and needs its own review');
  }

  const jobs = splitJobs(lines);
  if (jobs.length === 0) add('G21', 1, 'no jobs found');

  for (const job of jobs) {
    const body = job.lines;
    const jobText = (re) => body.find((l) => re.test(l.text));

    // G13: timeout-minutes at job level.
    const t = jobText(/^    timeout-minutes:\s*(\d+)\s*$/);
    if (!t) add('G13', job.start, `job ${job.name}: timeout-minutes is missing`);
    else if (Number(/(\d+)/.exec(t.text)[1]) > 30) add('G13', t.n, `job ${job.name}: timeout-minutes above 30`);

    // G22: runner pinned.
    const r = jobText(/^    runs-on:\s*(.+?)\s*$/);
    if (!r) add('G22', job.start, `job ${job.name}: runs-on is missing`);
    else if (!PINNED_RUNNER.test(/runs-on:\s*(.+?)\s*$/.exec(r.text)[1])) add('G22', r.n, `job ${job.name}: runner is not the pinned ubuntu-24.04: ${r.text.trim()}`);

    // G1 / G25 / G34: job permissions declared and within the allowed set.
    const pAt = body.findIndex((l) => /^    permissions:/.test(l.text));
    if (pAt < 0) add('G1', job.start, `job ${job.name}: permissions are not declared`);
    else {
      const inline = /^    permissions:\s*(.*?)(\s+#.*)?$/.exec(body[pAt].text)[1].trim();
      if (inline && inline !== '{}') add('G1', body[pAt].n, `job ${job.name}: permissions must be a block or {}: ${inline}`);
      const declared = [];
      for (let i = pAt + 1; i < body.length && /^      \S/.test(body[i].text); i++) declared.push({ n: body[i].n, p: body[i].text.trim() });
      const allowed = ALLOWED_PERMISSIONS[job.name];
      for (const d of declared) {
        if (/(write-all|read-all)/.test(d.p) || /^(checks|statuses|pull-requests|contents|id-token|packages|deployments|actions):\s*write/.test(d.p)) add('G34', d.n, `job ${job.name}: forbidden permission ${d.p}`);
        else if (allowed && !allowed.has(d.p)) add('G25', d.n, `job ${job.name}: permission ${d.p} is not in the allowed set`);
      }
    }

    // G25: environment only in allowed jobs.
    const env = jobText(/^    environment:/);
    if (env && !ENVIRONMENT_JOBS.includes(job.name)) add('G25', env.n, `job ${job.name}: environment is only allowed in ${ENVIRONMENT_JOBS.join(', ')}`);
    if (!env && ENVIRONMENT_JOBS.includes(job.name)) add('G25', job.start, `job ${job.name}: must use the bob-review environment`);

    // G25: secrets only as allowed and only on a step env: line; the review job has no GitHub token.
    for (const l of body) {
      if (l.text.trimStart().startsWith('#')) continue;
      for (const m of l.text.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) {
        const ok = (ALLOWED_SECRETS[job.name] ?? []).includes(m[1])
          && new RegExp(`^\\s+[A-Z_]+:\\s*\\$\\{\\{\\s*secrets\\.${m[1]}\\s*\\}\\}\\s*$`).test(l.text);
        if (!ok) add('G25', l.n, `job ${job.name}: secret reference not allowed here: ${l.text.trim()}`);
      }
      if (job.name === 'review' && /(github\.token|GITHUB_TOKEN)/.test(l.text)) add('G25', l.n, 'the review job must not reference a GitHub token');
      if (/^\s+if:/.test(l.text) && /secrets\./.test(l.text)) add('G25', l.n, 'secrets cannot be used in if:');
    }

    // Steps: pins (G22), checkout (G6), run strings (G24), one secret step per job (G25).
    const steps = stepsOf(job);
    for (const s of steps) {
      for (const l of s) {
        const u = /^\s*(?:- )?uses:\s*(\S.*)$/.exec(l.text);
        if (!u || u[1].startsWith('./')) continue;
        if (!SHA_PIN.test(u[1] + ' ')) add('G22', l.n, `action is not pinned by commit SHA: ${u[1]}`);
        if (/actions\/checkout@/.test(u[1])) {
          for (const c of s) if (/^\s+(ref|repository):/.test(c.text)) add('G6', c.n, `checkout must use the default ref of this repository: ${c.text.trim()}`);
        }
      }
    }
    for (const b of runBodies(body)) {
      for (const l of b) {
        if (l.text.includes('${{')) add('G24', l.n, `expression inside run: ${l.text.trim()}`);
        if (/secrets\./.test(l.text)) add('G25', l.n, 'secret referenced inside run:');
      }
    }
    const secretSteps = steps.filter((s) => s.some((l) => /secrets\./.test(l.text)));
    if (secretSteps.length > 1) add('G25', job.start, `job ${job.name}: a secret is referenced in more than one step`);
  }

  // G25: the Bob key is referenced exactly once in the whole file.
  const bobRefs = all.filter((l) => !l.text.trimStart().startsWith('#') && /secrets\.BOB_API_KEY/.test(l.text)).length;
  if (jobs.some((j) => j.name === 'review') && bobRefs !== 1) add('G25', 1, `secrets.BOB_API_KEY must be referenced exactly once, found ${bobRefs}`);

  return v;
}

function main() {
  let files = process.argv.slice(2);
  if (files.length === 0) {
    const dir = join(ROOT, 'integrations', 'github-actions');
    files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).map((f) => join(dir, f));
  }
  let bad = 0;
  for (const f of files) {
    for (const x of checkWorkflow(readFileSync(f, 'utf8'))) {
      console.error(`  [FAIL] ${relative(ROOT, f)}:${x.line} ${x.rule}: ${x.msg}`);
      bad++;
    }
  }
  console.log(`Checked ${files.length} workflow file(s). Violations: ${bad}`);
  process.exit(bad === 0 ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
