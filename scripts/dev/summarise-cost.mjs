#!/usr/bin/env node
// Phase 7: aggregate docs/results/cost-data.json into the figures used by docs/results/cost-summary.md.
// Offline; no GitHub or Bob calls. Usage: node scripts/dev/summarise-cost.mjs [docs/results/cost-data.json]

import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'docs/results/cost-data.json';
const data = JSON.parse(readFileSync(file, 'utf8'));

function stats(xs) {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const sum = v.reduce((a, b) => a + b, 0);
  return { n: v.length, min: v[0], p50: q(0.5), p90: q(0.9), max: v[v.length - 1], mean: sum / v.length, sum };
}
const r = (n, d = 4) => (n == null ? null : +n.toFixed(d));
const fmt = (s, d = 4) => (s ? Object.fromEntries(Object.entries(s).map(([k, x]) => [k, r(x, d)])) : null);

const runs = data.runs;
const byConclusion = {};
for (const x of runs) byConclusion[x.conclusion] = (byConclusion[x.conclusion] ?? 0) + 1;

const audited = runs.filter((x) => x.audit);
const byOutcome = {};
for (const x of audited) byOutcome[x.audit.outcome] = (byOutcome[x.audit.outcome] ?? 0) + 1;

// Runs with a Bob call: a reported total exists and is a number.
const withBob = audited.filter((x) => typeof x.audit.cost?.bob_usage?.total === 'number');
const reviewed = audited.filter((x) => x.audit.outcome === 'reviewed');

// Per PR: group the reviews by PR number.
const perPr = new Map();
for (const x of withBob) {
  const k = x.audit.cost.pr;
  const e = perPr.get(k) ?? { pr: k, runs: 0, bobcoins: 0 };
  e.runs += 1;
  e.bobcoins += x.audit.cost.bob_usage.total;
  perPr.set(k, e);
}

// Runner minutes: per workflow run, sum of billed job minutes (each job rounded up).
const minutesOf = (x) => x.jobs.reduce((a, j) => a + j.billed_minutes, 0);
const runnerMin = runs.map(minutesOf);
const runnerMinReviewed = runs.filter((x) => x.audit?.outcome === 'reviewed').map(minutesOf);
const jobSeconds = (name) =>
  runs.flatMap((x) => x.jobs.filter((j) => j.name === name && j.conclusion === 'success').map((j) => j.seconds));

// Estimator check: does Bobcoin usage track prompt size or output size?
const pts = reviewed
  .map((x) => ({ x: x.audit.cost.inputs.prompt_bytes, y: x.audit.cost.bob_usage.total, o: x.audit.cost.output.bytes }))
  .filter((p) => typeof p.x === 'number' && typeof p.y === 'number' && typeof p.o === 'number');
function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}

const out = {
  source: file,
  collected_at: data.collected_at,
  workflow_runs: runs.length,
  by_conclusion: byConclusion,
  audit_records: audited.length,
  audit_outcomes: byOutcome,
  bob_calls_with_reported_usage: withBob.length,
  reviewed: reviewed.length,
  bobcoins_total: r(withBob.reduce((a, x) => a + x.audit.cost.bob_usage.total, 0)),
  bobcoins_per_reviewed_run: fmt(stats(reviewed.map((x) => x.audit.cost.bob_usage.total)), 5),
  bobcoins_per_pr: fmt(stats([...perPr.values()].map((e) => e.bobcoins)), 5),
  prs_reviewed: perPr.size,
  reviews_per_pr: fmt(stats([...perPr.values()].map((e) => e.runs)), 2),
  pipeline_seconds_reviewed: fmt(stats(reviewed.map((x) => x.audit.cost.duration_seconds.total)), 1),
  bob_seconds_reviewed: fmt(stats(reviewed.map((x) => x.audit.cost.duration_seconds.bob)), 1),
  job_seconds: {
    prepare: fmt(stats(jobSeconds('prepare')), 1),
    review: fmt(stats(jobSeconds('review')), 1),
    publish: fmt(stats(jobSeconds('publish')), 1),
  },
  runner_minutes_per_workflow_run_all: fmt(stats(runnerMin), 2),
  runner_minutes_per_workflow_run_reviewed: fmt(stats(runnerMinReviewed), 2),
  runner_minutes_total_all_runs: runnerMin.reduce((a, b) => a + b, 0),
  runner_minutes_total_reviewed_runs: runnerMinReviewed.reduce((a, b) => a + b, 0),
  prompt_bytes_reviewed: fmt(stats(reviewed.map((x) => x.audit.cost.inputs.prompt_bytes)), 0),
  estimator: {
    n: pts.length,
    pearson_prompt_bytes_vs_bobcoins: pts.length > 2 ? r(pearson(pts.map((p) => p.x), pts.map((p) => p.y)), 3) : null,
    pearson_output_bytes_vs_bobcoins: pts.length > 2 ? r(pearson(pts.map((p) => p.o), pts.map((p) => p.y)), 3) : null,
  },
  by_day: {},
};
for (const x of withBob) {
  const day = x.created_at.slice(0, 10);
  const e = (out.by_day[day] ??= { calls: 0, bobcoins: 0 });
  e.calls += 1;
  e.bobcoins = r(e.bobcoins + x.audit.cost.bob_usage.total, 6);
}
console.log(JSON.stringify(out, null, 2));
