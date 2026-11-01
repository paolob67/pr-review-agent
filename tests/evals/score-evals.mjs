#!/usr/bin/env node
// tests/evals/score-evals.mjs
// Phase 6 eval scorer.
//
// Reads docs/results/phase-6-evals-tracking.json, fetches each PR's bob-review comment,
// scores recall/precision/variance, writes results JSON, and optionally closes all PRs.
//
// Usage:
//   node tests/evals/score-evals.mjs             (score only, keep PRs open)
//   node tests/evals/score-evals.mjs --close     (score then close every PR and delete its branch)
//   node tests/evals/score-evals.mjs --set train (score train set only)

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPECTED = JSON.parse(readFileSync(join(ROOT, 'tests', 'evals', 'expected.json'), 'utf8'));
const OUT      = join(ROOT, 'docs', 'results');
const TRACK    = join(OUT, 'phase-6-evals-tracking.json');
const REPO     = process.env.E2E_REPO || 'paolob67/notes-sandbox';

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function run(cmd, args, { input } = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
const gh  = (args, input) => run('gh', args, { input });
const api = (path, ...extra) => JSON.parse(gh(['api', path, ...extra]));

// ---------------------------------------------------------------------------
// Finding extraction (same as runner.mjs)
// ---------------------------------------------------------------------------
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function parseFindings(body) {
  if (!body) return { findings: [], findingsDropped: 0, cost: null };
  const droppedMatch = /(\d+) finding\(s\) dropped/.exec(body);
  const findingsDropped = droppedMatch ? parseInt(droppedMatch[1], 10) : 0;
  const costMatch = /Cost this run: ([\d.]+) Bobcoins/.exec(body);
  const cost = costMatch ? parseFloat(costMatch[1]) : null;
  const findings = [];
  const re = /^- \*\*\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\] ([^\*]+)\*\* `([^:]+):(\d+)` \(confidence: (\w+)\)(?: Rule `([^`]+)`)?/gim;
  let m;
  while ((m = re.exec(body)) !== null) {
    findings.push({ severity: m[1].toLowerCase(), title: m[2].trim(), file: m[3].trim(), line: parseInt(m[4], 10), confidence: m[5].toLowerCase(), rule_id: m[6] ?? null });
  }
  const sections = ['Security', 'Standards', 'Team rules', 'Other'];
  const sectionOffsets = sections.map((s) => ({ name: s.toLowerCase().replace(' ', '_'), idx: body.indexOf(`#### ${s}`) })).filter((x) => x.idx >= 0).sort((a, b) => a.idx - b.idx);
  for (const f of findings) {
    const offset = body.indexOf(`- **[${f.severity.toUpperCase()}] ${f.title}**`);
    let category = 'other';
    for (const s of sectionOffsets) { if (s.idx <= offset) category = s.name; }
    f.category = category === 'team_rules' ? 'team_rule' : category;
  }
  return { findings, findingsDropped, cost };
}

function scoreRemediation(body) {
  if (!body) return 0;
  const hasFindings = /#### Security|#### Standards|#### Team rules/.test(body);
  if (!hasFindings) return 0;
  return /```/.test(body) ? 2 : 1;
}

function avg(arr) { return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length; }
function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function scoreCase(caseId, repData) {
  const exp = EXPECTED.cases[caseId];
  if (!exp) return null;
  const allFindings = repData.flatMap((r) => r.findings);
  const repCounts   = repData.map((r) => r.findings.length);

  if (exp.clean) {
    const fps = allFindings.filter((f) =>
      ['security', 'standards', 'team_rule'].includes(f.category) &&
      (SEVERITY_RANK[f.severity] ?? 0) >= SEVERITY_RANK['medium']
    );
    const maxAllowed = (exp.max_real_findings ?? 0) * repData.length;
    return { type: 'clean', fp_count: fps.length, fp_per_rep: fps.length / repData.length, pass: fps.length <= maxAllowed, repCounts, variance: stdev(repCounts) };
  }

  const minFindings = exp.min_findings ?? 1;
  const expRuleIds  = exp.expected_rule_ids ?? [];
  const expCats     = exp.expected_categories ?? [];
  const minSev      = exp.expected_min_severity ?? 'info';
  const minRank     = SEVERITY_RANK[minSev] ?? 0;

  const ruleHits = expRuleIds.map((id) => ({ id, found: allFindings.some((f) => f.rule_id === id) }));
  const catHits  = expCats.map((cat) => ({ cat, found: allFindings.some((f) => f.category === cat) }));
  const repsWithSev   = repData.filter((r) => r.findings.some((f) => (SEVERITY_RANK[f.severity] ?? 0) >= minRank)).length;
  const repsWithCount = repData.filter((r) => r.findings.length >= minFindings).length;
  const sevMet   = repsWithSev >= Math.ceil(repData.length / 2);
  const countMet = repsWithCount >= Math.ceil(repData.length / 2);
  const recall   = expRuleIds.length > 0
    ? ruleHits.filter((x) => x.found).length / expRuleIds.length
    : catHits.filter((x) => x.found).length / Math.max(expCats.length, 1);
  const pass = countMet && sevMet && (expRuleIds.length === 0 || recall >= 0.5);

  return { type: 'flawed', pass, recall, ruleHits, catHits, sevMet, countMet, repCounts, avgFindings: avg(repCounts), variance: stdev(repCounts), droppedPerRep: avg(repData.map((r) => r.findingsDropped ?? 0)), remediationScores: repData.map((r) => r.remediationScore) };
}

// ---------------------------------------------------------------------------
// PR management helpers
// ---------------------------------------------------------------------------
function getMarkerComment(prNumber) {
  try {
    const list = api(`repos/${REPO}/issues/${prNumber}/comments?per_page=100`);
    const m = list.find((c) => (c.body ?? '').trimStart().startsWith('<!-- bob-pr-review:v1 '));
    return m?.body ?? null;
  } catch { return null; }
}

function closePR(prNumber, branch) {
  try { JSON.parse(gh(['api', '-X', 'PATCH', `repos/${REPO}/pulls/${prNumber}`, '--input', '-'], JSON.stringify({ state: 'closed' }))); } catch { /* already closed */ }
  if (branch) {
    try { gh(['api', '-X', 'DELETE', `repos/${REPO}/git/refs/heads/${encodeURIComponent(branch)}`]); } catch { /* already gone */ }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args      = process.argv.slice(2);
  const doClose   = args.includes('--close');
  const setIdx    = args.indexOf('--set');
  const setFilter = setIdx >= 0 ? (args[setIdx + 1] ?? null) : null;

  if (!existsSync(TRACK)) {
    console.error(`Tracking file not found: ${TRACK}`);
    console.error('Run node tests/evals/open-all-evals.mjs first.');
    process.exit(1);
  }

  const tracking = JSON.parse(readFileSync(TRACK, 'utf8'));
  gh(['auth', 'status']);

  // Group entries by case id.
  const byCase = {};
  for (const e of tracking.prs) {
    if (setFilter && e.set !== setFilter) continue;
    if (!byCase[e.id]) byCase[e.id] = [];
    byCase[e.id].push(e);
  }

  let totalCases = 0; let passCases = 0; let allPass = true;
  let totalCost = 0; let totalBobCalls = 0;
  const results = { date: new Date().toISOString(), repo: REPO, cases: {} };

  for (const [caseId, entries] of Object.entries(byCase)) {
    const exp = EXPECTED.cases[caseId];
    if (!exp) { log(`WARNING: no expected entry for ${caseId}`); continue; }
    totalCases++;
    const set  = exp.set ?? 'unknown';
    const type = exp.clean ? 'clean' : 'flawed';
    log(`=== ${caseId} [${set}/${type}]`);

    const repData = [];
    for (const e of entries) {
      if (!e.pr) {
        log(`  rep${e.rep}: no PR (open error), skip`);
        repData.push({ rep: e.rep, findings: [], findingsDropped: 0, cost: null, remediationScore: 0, commentLength: 0, outcome: 'no_pr' });
        continue;
      }
      log(`  rep${e.rep}: fetching comment for PR #${e.pr} ...`);
      const body = getMarkerComment(e.pr);
      if (!body) {
        log(`  rep${e.rep}: NO COMMENT YET on PR #${e.pr}`);
        repData.push({ rep: e.rep, findings: [], findingsDropped: 0, cost: null, remediationScore: 0, commentLength: 0, outcome: 'no_comment' });
        allPass = false;
      } else {
        const { findings, findingsDropped, cost } = parseFindings(body);
        const remediationScore = scoreRemediation(body);
        if (cost != null) totalCost += cost;
        totalBobCalls++;
        log(`  rep${e.rep}: ${findings.length} findings, cost=${cost ?? 'n/a'}, remediation=${remediationScore}`);
        repData.push({ rep: e.rep, findings, findingsDropped, cost, remediationScore, commentLength: body.length, outcome: 'reviewed' });
      }

      if (doClose && e.pr) {
        log(`  rep${e.rep}: closing PR #${e.pr}`);
        closePR(e.pr, e.branch);
      }
    }

    const score = scoreCase(caseId, repData);
    if (!score) continue;
    const pass = score.pass;
    if (!pass) allPass = false;
    passCases += pass ? 1 : 0;

    if (score.type === 'flawed') {
      log(`  ${pass ? 'PASS' : 'FAIL'} recall=${score.recall.toFixed(2)} avgFindings=${score.avgFindings.toFixed(1)} variance=${score.variance.toFixed(2)}`);
    } else {
      log(`  ${pass ? 'PASS' : 'FAIL'} fp_count=${score.fp_count} fp_per_rep=${score.fp_per_rep.toFixed(2)}`);
    }
    results.cases[caseId] = { set, ...score };
  }

  if (doClose) {
    gh(['variable', 'set', 'BOB_REVIEW_ENABLED', '-R', REPO, '--body', 'false']);
    log('Kill switch: OFF');
  }

  results.summary = { totalCases, passCases, allPass, totalCost: parseFloat(totalCost.toFixed(4)), totalBobCalls };
  mkdirSync(OUT, { recursive: true });
  const outFile = join(OUT, setFilter ? `phase-6-evals-${setFilter.replace('-', '')}.json` : 'phase-6-evals-all.json');
  writeFileSync(outFile, JSON.stringify(results, null, 2) + '\n');

  log('');
  log(`=== Eval score: ${passCases}/${totalCases} cases passed | overall: ${allPass ? 'PASS' : 'FAIL'}`);
  log(`    Total Bob cost: ${totalCost.toFixed(4)} Bobcoins across ${totalBobCalls} calls`);

  const trainPass  = Object.entries(results.cases).filter(([, c]) => c.set === 'train').filter(([, c]) => c.pass).length;
  const trainTotal = Object.entries(results.cases).filter(([, c]) => c.set === 'train').length;
  const hoPass  = Object.entries(results.cases).filter(([, c]) => c.set === 'held-out').filter(([, c]) => c.pass).length;
  const hoTotal = Object.entries(results.cases).filter(([, c]) => c.set === 'held-out').length;
  if (trainTotal > 0) log(`    Train:    ${trainPass}/${trainTotal}`);
  if (hoTotal > 0)    log(`    Held-out: ${hoPass}/${hoTotal}`);

  log(`Results written to ${outFile}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => { console.error(`[score-evals] ${err.message}`); process.exit(1); });
