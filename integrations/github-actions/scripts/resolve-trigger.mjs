#!/usr/bin/env node
// integrations/github-actions/scripts/resolve-trigger.mjs
// Guardrails: G6 (no PR code is read or run: API calls only), G12 (triggers), G24 (identifiers are
//             validated and the PR is resolved through the API), G31 (all required CI workflows
//             green for the exact head SHA), G32 (the head SHA used is the one the PR has now).
//
// Runs as a step of the `prepare` job, before the reviewer. It decides whether a review may start
// and which pull request and head SHA it is for. Holds only the read-only job token (SCM_READ_TOKEN).
// Everything arrives as environment variables set from `env:` in the workflow, never as a command
// line argument or inside a shell string.
//
//   TRIGGER_EVENT            workflow_run | pull_request_target | workflow_dispatch
//   TRIGGER_HEAD_SHA         workflow_run: head SHA of the finished run; dispatch: the SHA given
//   TRIGGER_PR_NUMBER        pull_request_target: PR number; dispatch: the number given
//   TRIGGER_WORKFLOW_NAME    workflow_run: name of the finished workflow (used when no list is set)
//   REVIEW_REQUIRED_WORKFLOWS  comma separated names from the repository variable (G31)
//   REVIEW_REPO              owner/name
//   REVIEW_API_BASE          optional, defaults to https://api.github.com (tests use a mock)
//   GITHUB_OUTPUT            file the step outputs are appended to
//
// Outputs: ready (true|false), reason, pr_number, head_sha. When ready is false nothing else runs and
// the workflow run stays green: a pending, red or cancelled CI is not an error.
// No runtime dependencies.

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const PR_RE = /^[1-9][0-9]{0,8}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const NAME_RE = /^[A-Za-z0-9 ._()-]{1,100}$/;
const EVENTS = new Set(['workflow_run', 'pull_request_target', 'workflow_dispatch']);

// Pure parse of the repository variable: trimmed, unique, valid names only. Any invalid entry makes
// the whole list invalid (fail closed) so a typo cannot silently drop a required workflow.
export function parseRequired(list, triggeringName) {
  const raw = String(list ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const names = raw.length > 0 ? raw : (triggeringName ? [String(triggeringName).trim()] : []);
  if (names.length === 0 || names.some((n) => !NAME_RE.test(n))) return null;
  return [...new Set(names)];
}

// Pure G31 evaluation over the runs listed for one head SHA. For each required name the run with the
// highest run_number counts (a re-run updates the same run; a new run has a higher number).
// Returns { ok: true } or { ok: false, reason, name }.
export function evaluateRequired(runs, names) {
  for (const name of names) {
    const mine = runs.filter((r) => r?.name === name && r.event === 'pull_request');
    if (mine.length === 0) return { ok: false, reason: 'ci_missing', name };
    const latest = mine.reduce((a, b) => (b.run_number > a.run_number ? b : a));
    if (latest.status !== 'completed') return { ok: false, reason: 'ci_pending', name };
    if (latest.conclusion !== 'success') return { ok: false, reason: 'ci_not_green', name };
  }
  return { ok: true };
}

async function getJson(fetchImpl, base, token, path) {
  const res = await fetchImpl(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pr-review-agent-trigger/0.1.0',
    },
  });
  if (res.status !== 200) throw new Error(`GET ${path.split('?')[0]} failed: HTTP ${res.status}`);
  return res.json();
}

// resolveTrigger returns { ready, reason, prNumber?, headSha? }. It never throws for an expected
// condition; an API failure is reported as reason 'api_error' (the run stays green, nothing runs).
export async function resolveTrigger(env, fetchImpl = fetch) {
  const stop = (reason, extra = {}) => ({ ready: false, reason, ...extra });
  const repo = env.REVIEW_REPO ?? '';
  const event = env.TRIGGER_EVENT ?? '';
  const token = env.SCM_READ_TOKEN ?? '';
  const base = (env.REVIEW_API_BASE || 'https://api.github.com').replace(/\/$/, '');

  if (!REPO_RE.test(repo)) return stop('rejected_input');
  if (!EVENTS.has(event)) return stop('rejected_input');
  if (!token) return stop('rejected_input');

  try {
    let prNumber;
    let headSha;

    if (event === 'workflow_dispatch') {
      // Manual run by someone with write access: no CI check, the reviewer still validates and pins.
      if (!PR_RE.test(env.TRIGGER_PR_NUMBER ?? '') || !SHA_RE.test(env.TRIGGER_HEAD_SHA ?? '')) return stop('rejected_input');
      return { ready: true, reason: 'manual', prNumber: env.TRIGGER_PR_NUMBER, headSha: env.TRIGGER_HEAD_SHA };
    }

    if (event === 'workflow_run') {
      headSha = env.TRIGGER_HEAD_SHA ?? '';
      if (!SHA_RE.test(headSha)) return stop('rejected_input');
      // The payload list of pull requests is empty for fork PRs, so the PR is always resolved from
      // the SHA through the API (G24). Only an open PR of this repository with this exact head counts.
      const pulls = await getJson(fetchImpl, base, token, `/repos/${repo}/commits/${headSha}/pulls?per_page=100`);
      const open = (Array.isArray(pulls) ? pulls : []).filter((p) =>
        p?.state === 'open' && p.head?.sha === headSha && p.base?.repo?.full_name === repo && Number.isInteger(p.number));
      if (open.length === 0) return stop('no_open_pr');
      if (open.length > 1) return stop('ambiguous_pr');
      prNumber = String(open[0].number);
    } else {
      // pull_request_target (label): the number is an integer from the payload; the SHA comes from the API.
      if (!PR_RE.test(env.TRIGGER_PR_NUMBER ?? '')) return stop('rejected_input');
      const pr = await getJson(fetchImpl, base, token, `/repos/${repo}/pulls/${env.TRIGGER_PR_NUMBER}`);
      if (pr?.state !== 'open') return stop('no_open_pr');
      if (pr.base?.repo?.full_name !== repo || !SHA_RE.test(pr.head?.sha ?? '')) return stop('rejected_input');
      prNumber = env.TRIGGER_PR_NUMBER;
      headSha = pr.head.sha;
    }

    // G31: every required workflow green for this exact SHA.
    const names = parseRequired(env.REVIEW_REQUIRED_WORKFLOWS, event === 'workflow_run' ? env.TRIGGER_WORKFLOW_NAME : '');
    if (!names) return stop('no_required_ci');
    const listing = await getJson(fetchImpl, base, token,
      `/repos/${repo}/actions/runs?head_sha=${headSha}&event=pull_request&per_page=100`);
    const verdict = evaluateRequired(Array.isArray(listing?.workflow_runs) ? listing.workflow_runs : [], names);
    if (!verdict.ok) return stop(verdict.reason, { prNumber, headSha, name: verdict.name });

    return { ready: true, reason: event === 'workflow_run' ? 'ci_green' : 'label_ci_green', prNumber, headSha };
  } catch (err) {
    // Message holds a path and a status only; the token is never part of it.
    process.stderr.write(`[trigger] ${err.message}\n`);
    return stop('api_error');
  }
}

async function main() {
  const r = await resolveTrigger(process.env);
  // Logged values are validated tokens or null: the SHA only when it matches the 40-hex pattern.
  const sha = SHA_RE.test(process.env.TRIGGER_HEAD_SHA ?? '') ? process.env.TRIGGER_HEAD_SHA : (r.headSha ?? null);
  process.stdout.write(`${JSON.stringify({ event: 'trigger', ready: r.ready, reason: r.reason, pr: r.prNumber ?? null, head_sha: sha, workflow: r.name ?? null })}\n`);
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    // Values are validated tokens (digits, hex, a fixed reason word): no newline can be injected.
    const lines = [`ready=${r.ready ? 'true' : 'false'}`, `reason=${r.reason}`];
    if (r.ready) lines.push(`pr_number=${r.prNumber}`, `head_sha=${r.headSha}`);
    appendFileSync(out, `${lines.join('\n')}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { process.stderr.write(`[trigger] unexpected crash: ${err.message}\n`); process.exit(1); });
}
