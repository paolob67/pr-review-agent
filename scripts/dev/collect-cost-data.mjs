#!/usr/bin/env node
// Phase 7: collect per-run cost data from the sandbox repo (G20, G26, G37).
//
// Reads, through the gh CLI (read-only calls): every run of bob-review.yml, the job timings of each
// run, and the `audit` artifact of each run that has one (the cost record; no PR content, no secrets,
// CONTRACTS section 7). Writes docs/results/cost-data.json so the figures survive the 14 day
// retention of the audit artifact.
//
// Usage: node scripts/dev/collect-cost-data.mjs OWNER/REPO [--out docs/results/cost-data.json]
// No Bob calls; uses GitHub API quota only. Nothing is printed except counts.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

const args = process.argv.slice(2);
const repo = args[0];
if (!repo || !REPO_RE.test(repo)) {
  console.error('usage: collect-cost-data.mjs OWNER/REPO [--out FILE]');
  process.exit(2);
}
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : 'docs/results/cost-data.json';

async function gh(argv, buffer = false) {
  const { stdout } = await run('gh', argv, { maxBuffer: 256 * 1024 * 1024, encoding: buffer ? 'buffer' : 'utf8' });
  return stdout;
}

async function ghJson(path) {
  const text = await gh(['api', '--paginate', '--slurp', path]);
  return JSON.parse(text);
}

// Bounded concurrency so the API is not hammered.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const seconds = (a, b) => (a && b ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 1000) : null);

const runPages = await ghJson(`repos/${repo}/actions/workflows/bob-review.yml/runs?per_page=100`);
const runs = runPages.flatMap((p) => p.workflow_runs);

const artPages = await ghJson(`repos/${repo}/actions/artifacts?per_page=100`);
const artifacts = artPages.flatMap((p) => p.artifacts);
const auditByRun = new Map();
for (const a of artifacts) if (a.name === 'audit' && !a.expired) auditByRun.set(a.workflow_run.id, a);

const tmp = await mkdtemp(join(tmpdir(), 'cost-data-'));
try {
  const records = await mapLimit(runs, 6, async (r) => {
    const jobsText = await gh(['api', `repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`]);
    const jobs = JSON.parse(jobsText).jobs.map((j) => {
      const s = seconds(j.started_at, j.completed_at);
      return {
        name: j.name,
        conclusion: j.conclusion,
        seconds: s,
        // GitHub bills each job rounded up to a whole minute.
        billed_minutes: s == null || j.conclusion === 'skipped' ? 0 : Math.max(1, Math.ceil(s / 60)),
      };
    });
    let audit = null;
    const art = auditByRun.get(r.id);
    if (art) {
      const zip = join(tmp, `${art.id}.zip`);
      await writeFile(zip, await gh(['api', `repos/${repo}/actions/artifacts/${art.id}/zip`], true));
      const { stdout } = await run('unzip', ['-p', zip, 'audit.json'], { maxBuffer: 16 * 1024 * 1024 });
      audit = JSON.parse(stdout);
      await rm(zip);
    }
    return {
      run_id: r.id,
      created_at: r.created_at,
      event: r.event,
      conclusion: r.conclusion,
      run_attempt: r.run_attempt,
      jobs,
      audit,
    };
  });

  records.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { writeFile: wf, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(out), { recursive: true });
  await wf(out, JSON.stringify({ collected_at: new Date().toISOString(), repo, runs: records }, null, 1) + '\n');
  const withAudit = records.filter((r) => r.audit).length;
  console.log(`runs=${records.length} audit_records=${withAudit} wrote=${out}`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
