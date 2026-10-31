#!/usr/bin/env node
// scripts/validation/mutation-check.js
// Guardrails: all offline-testable guardrails (see MUTATIONS below).
//
// Real mutation check (PLAN section 9): for each mutation, copy reviewer/ and tests/ to a temp
// directory, apply one textual patch that disables a guardrail, run the covering test files, and
// require them to FAIL. A mutation that the tests do not detect is a "survivor" and exits nonzero.
// The repository working tree is never modified.
//
// Usage: node scripts/validation/mutation-check.js [--only G13] [--write]
//   --only <id>   run mutations whose id starts with the given prefix
//   --write       write the result table to docs/results/mutation-check.md

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'results', 'mutation-check.md');

const U = (n) => `tests/unit/${n}.test.js`;
const P = 'tests/pipeline/pipeline.test.js';
const S = 'tests/pipeline/stages.test.js';
const W = 'tests/unit/workflowPolicy.test.js';

// Each mutation: id, guardrail, file, find (must occur exactly once), replace, tests, description.
export const MUTATIONS = [
  { id: 'G2', file: 'reviewer/src/runBob.js', find: "new Set(['BOB_API_KEY', 'PATH', 'HOME', 'NODE_ENV'])", replace: "new Set(['BOB_API_KEY', 'PATH', 'HOME', 'NODE_ENV', 'SCM_READ_TOKEN', 'SCM_COMMENT_TOKEN'])", tests: [U('runBob')], desc: 'Allow SCM tokens into the Bob env allowlist' },
  { id: 'G3', file: 'reviewer/src/runBob.js', find: 'for (const key of ALLOWED_ENV_VARS) {', replace: 'for (const key of Object.keys(parentEnv)) {', tests: [U('runBob'), P], desc: 'Pass the whole parent env instead of the allowlist' },
  { id: 'G4', file: 'reviewer/src/runBob.js', find: "'--disable-tool-groups', 'edit,execute',", replace: "'--disable-tool-groups', 'subagent',", tests: [U('runBob')], desc: 'Edit and execute tool groups no longer disabled' },
  { id: 'G23a', file: 'reviewer/src/runBob.js', find: 'env.HOME = bobUser.home;', replace: '/* wrapper HOME kept */', tests: [U('runBob')], desc: 'Bob keeps the wrapper HOME instead of its own' },
  { id: 'G23b', file: 'reviewer/src/runBob.js', find: 'uid <= 0 || gid <= 0', replace: 'uid < 0 || gid < 0', tests: [U('runBob')], desc: 'Bob identity may be root' },

  { id: 'G30', file: 'reviewer/src/runBob.js', find: "    '--disable-mcp',\n", replace: '', tests: [U('runBob')], desc: 'MCP no longer disabled' },
  { id: 'G7', file: 'reviewer/src/gate.js', find: 'if (!ALLOWED_ASSOCIATIONS.has(assoc)) {', replace: 'if (false) {', tests: [U('gate')], desc: 'Disable the author association check' },
  { id: 'G8', file: 'reviewer/src/gate.js', find: 'export function checkSizes(fileCount, diffBytes, config) {', replace: 'export function checkSizes(fileCount, diffBytes, config) {\n  return null;', tests: [U('gate'), P], desc: 'Size gate always passes' },
  { id: 'G9a', file: 'reviewer/src/gate.js', find: 'if (pr.draft === true) {', replace: 'if (false) {', tests: [U('gate'), P], desc: 'Draft PRs are reviewed' },
  { id: 'G9b', file: 'reviewer/src/gate.js', find: 'if (allIgnored) {', replace: 'if (false) {', tests: [U('gate'), P], desc: 'Lockfile or docs-only PRs are reviewed' },
  { id: 'G10', file: 'reviewer/src/main.js', find: 'if (!config.enabled) {', replace: 'if (false) {', tests: [P], desc: 'Kill switch ignored' },
  { id: 'G13', file: 'reviewer/src/runBob.js', find: "try { child.kill('SIGKILL'); } catch { /* already exited */ }", replace: '/* kill disabled */', tests: [U('runBob')], desc: 'Timeout no longer kills the Bob process' },
  { id: 'G14a', file: 'reviewer/src/gate.js', find: 'export function checkBudget(runs, config) {', replace: 'export function checkBudget(runs, config) {\n  return null;', tests: [U('gate'), P], desc: 'Budget gate always passes' },
  { id: 'G14b', file: 'reviewer/src/render.js', find: 'bobcoins: +(priorCostBobcoins + (costRecord?.bob_usage?.total ?? 0)).toFixed(6),\n  };', replace: 'bobcoins: null,\n  };', tests: [U('render'), P], desc: 'Cumulative spend is not carried into the marker' },
  { id: 'G15', file: 'reviewer/src/redact.js', find: "if (typeof diff !== 'string') return diff;", replace: 'return diff;', tests: [U('redact'), P], desc: 'Diff is not redacted' },
  { id: 'G16a', file: 'reviewer/src/validate.js', find: 'if (parsed.schema_version !== 1) {', replace: 'if (false) {', tests: [U('validate')], desc: 'schema_version not checked' },
  { id: 'G16b', file: 'reviewer/src/parseOutput.js', find: "throw new ParseError('No result JSON line found in Bob stdout');", replace: 'return { parsed: { schema_version: 1, findings: [] }, stats: null };', tests: [U('parseOutput'), P], desc: 'Missing result line yields an empty review' },
  { id: 'G17a', file: 'reviewer/src/sanitise.js', find: "out = out.replace(HTML_TAG_RE, '');", replace: '', tests: [U('sanitise')], desc: 'HTML not stripped' },
  { id: 'G17b', file: 'reviewer/src/sanitise.js', find: "out = out.replace(BIDI_RE, '');", replace: '', tests: [U('sanitise'), P], desc: 'Bidi characters not stripped' },
  { id: 'G17c', file: 'reviewer/src/sanitise.js', find: "out = out.replace(MENTION_RE, '');", replace: '', tests: [U('sanitise')], desc: '@mentions not stripped' },
  { id: 'G17d', file: 'reviewer/src/sanitise.js', find: "out = out.replace(MD_IMAGE_RE, '');", replace: '', tests: [U('sanitise')], desc: 'Markdown images not stripped' },
  { id: 'G18', file: 'reviewer/src/publish.js', find: 'if (existing) {', replace: 'if (false) {', tests: [U('render'), P], desc: 'Always create a new comment' },
  { id: 'G19', file: 'reviewer/src/render.js', find: ' AI Assisted, advisory only.`', replace: '`', tests: [U('render'), P], desc: 'Footer no longer states advisory status' },
  { id: 'G20', file: 'reviewer/src/audit.js', find: "process.stdout.write(line + '\\n');", replace: '/* no output */', tests: [U('audit'), P], desc: 'Audit log is silent' },
  { id: 'G24a', file: 'reviewer/src/input.js', find: 'if (!SHA_RE.test(headSha)) {', replace: 'if (false) {', tests: [U('input')], desc: 'Head SHA not validated' },
  { id: 'G24b', file: 'reviewer/src/input.js', find: 'if (!REPO_RE.test(repo)) {', replace: 'if (false) {', tests: [U('input'), P], desc: 'Repo name not validated' },
  { id: 'G27', file: 'reviewer/src/audit.js', find: "out = out.split(s).join('[SCRUBBED]');", replace: 'out = out;', tests: [U('audit')], desc: 'Log scrubber disabled' },
  { id: 'G28', file: 'reviewer/src/scratch.js', find: 'const found = walkForbidden(scratchDir, scratchDir);', replace: 'const found = [];', tests: [U('scratch')], desc: 'Forbidden path check disabled' },
  { id: 'G32', file: 'reviewer/src/gate.js', find: 'if (pr.head?.sha !== headSha) {', replace: 'if (false) {', tests: [U('gate'), P], desc: 'Head pinning disabled' },
  { id: 'G33a', file: 'reviewer/src/stages.js', find: 'loadRules(readClient, repo, pr.base.ref)', replace: 'loadRules(readClient, repo, pr.head.ref)', tests: [P], desc: 'Rules read from the PR head branch' },
  { id: 'G33b', file: 'reviewer/src/rules.js', find: "'.bob-review/standards.md', baseBranch)", replace: "'.bob-review/standards.md', 'HEAD')", tests: [U('rules')], desc: 'Standards read from a fixed ref instead of the base branch' },
  { id: 'G34a', file: 'reviewer/src/github.js', find: "request('POST', `${base}/repos/${repo}/issues/${prNumber}/comments`", replace: "request('POST', `${base}/repos/${repo}/pulls/${prNumber}/reviews`", tests: [U('github'), P], desc: 'Publisher posts to the pull request reviews endpoint' },
  { id: 'G34b', file: 'reviewer/src/github.js', find: 'return { getPR, getPRDiff, getFileContents, listComments, createComment, updateComment };', replace: 'return { getPR, getPRDiff, getFileContents, listComments, createComment, updateComment, submitReview: async () => {} };', tests: [U('github')], desc: 'Client exposes an extra (review) operation' },
  { id: 'G35a', file: 'reviewer/src/render.js', find: "const parts = [marker, '', ADVISORY_HEADER];", replace: "const parts = [marker, ''];", tests: [U('render'), P], desc: 'Advisory header omitted' },
  { id: 'G35b', file: 'reviewer/src/sanitise.js', find: "out = out.replace(FAKE_HEADER_RE, '');", replace: '', tests: [U('sanitise'), P], desc: 'Fake advisory header not stripped' },
  { id: 'G36a', file: 'reviewer/src/validate.js', find: 'if (!linesForFile.has(f.line)) return', replace: 'if (false) return', tests: [U('validate'), P], desc: 'Hallucinated line numbers accepted' },
  { id: 'G36b', file: 'reviewer/src/triage.js', find: 'if (categoryCounts[cat] <= maxPerCategory) {', replace: 'if (true) {', tests: [U('triage')], desc: 'Per-category cap removed' },
  { id: 'G36c', file: 'reviewer/src/triage.js', find: 'if (!seen.has(key)) {', replace: 'if (true) {', tests: [U('triage')], desc: 'De-duplication removed' },
  { id: 'G36d', file: 'reviewer/src/validate.js', find: 'if (!ruleIds.has(f.rule_id)) {', replace: 'if (false) {', tests: [U('validate')], desc: 'Unknown rule IDs accepted' },
  { id: 'G14c', file: 'reviewer/src/stages.js', find: 'const priorSpend = existingMeta?.cost_total?.bobcoins ?? 0;', replace: 'const priorSpend = 0;', tests: [P], desc: 'Prior spend ignored when counting the per-PR total' },
  { id: 'G25a', file: 'reviewer/src/stages.js', find: "const commentClient = makeGithubClient(config.apiBase, env.SCM_COMMENT_TOKEN);", replace: "const commentClient = makeGithubClient(config.apiBase, env.SCM_READ_TOKEN);", tests: [S], desc: 'Publish stage uses the read token instead of the comment token' },
  { id: 'G25b', file: 'reviewer/src/stages.js', find: "const readClient = makeGithubClient(config.apiBase, env.SCM_READ_TOKEN);", replace: "const readClient = makeGithubClient(config.apiBase, env.SCM_COMMENT_TOKEN);", tests: [S], desc: 'Prepare stage uses the comment token instead of the read token' },
  { id: 'G16d', file: 'reviewer/src/stages.js', find: "if (typeof stdout !== 'string') return { error: 'stdout is not a string' };", replace: "", tests: [S], desc: 'Untrusted result: stdout type not checked' },
  { id: 'G16e', file: 'reviewer/src/stages.js', find: "if (Buffer.byteLength(stdout, 'utf8') > MAX_RESULT_BYTES) return { error: 'result is too large' };", replace: "", tests: [S], desc: 'Untrusted result: size not limited' },
  { id: 'G24c', file: 'reviewer/src/main.js', find: "handoff.repo !== repo || handoff.prNumber !== prNumber || handoff.headSha !== headSha", replace: "false", tests: [S], desc: 'Handoff for other inputs is accepted' },
  { id: 'G1', file: 'scripts/validation/workflow-policy.js', find: "add('G1', 1, 'top-level `permissions: {}` is missing')", replace: "void 0", tests: [W], desc: 'Policy no longer requires top-level permissions' },
  { id: 'G13w', file: 'scripts/validation/workflow-policy.js', find: "if (!t) add('G13', job.start, `job ${job.name}: timeout-minutes is missing`);", replace: "if (!t) void 0;", tests: [W], desc: 'Policy no longer requires job timeouts' },
  { id: 'G22w', file: 'scripts/validation/workflow-policy.js', find: "if (!SHA_PIN.test(u[1] + ' ')) add('G22'", replace: "if (false) add('G22'", tests: [W], desc: 'Policy no longer requires SHA-pinned actions' },
  { id: 'G24w', file: 'scripts/validation/workflow-policy.js', find: "if (l.text.includes('${{')) add('G24'", replace: "if (false) add('G24'", tests: [W], desc: 'Policy allows expressions inside run:' },
  { id: 'G25w', file: 'scripts/validation/workflow-policy.js', find: "if (job.name === 'review' && /(github", replace: "if (false && /(github", tests: [W], desc: 'Policy allows a GitHub token in the review job' },
  { id: 'G34w', file: 'scripts/validation/workflow-policy.js', find: "add('G34', d.n, `job ${job.name}: forbidden permission ${d.p}`);", replace: "void 0;", tests: [W], desc: 'Policy allows forbidden write scopes' },
  { id: 'G37', file: 'reviewer/src/cost.js', find: "total: typeof stats.session_costs === 'number' ? stats.session_costs : null,", replace: 'total: null,', tests: [U('cost'), P], desc: 'Reported Bob cost dropped from the record' },
];

function runTests(cwd, files) {
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const write = args.includes('--write');
  const list = MUTATIONS.filter((m) => !only || m.id.startsWith(only));

  const work = mkdtempSync(join(tmpdir(), 'mutation-'));
  const rows = [];
  try {
    cpSync(join(ROOT, 'reviewer'), join(work, 'reviewer'), { recursive: true });
    cpSync(join(ROOT, 'tests'), join(work, 'tests'), { recursive: true });
    cpSync(join(ROOT, 'scripts', 'validation', 'workflow-policy.js'), join(work, 'scripts', 'validation', 'workflow-policy.js'), { recursive: true });
    cpSync(join(ROOT, 'integrations', 'github-actions'), join(work, 'integrations', 'github-actions'), { recursive: true });

    const allTests = [...new Set(MUTATIONS.flatMap((m) => m.tests))];
    const base = runTests(work, allTests);
    if (base.code !== 0) {
      console.error('Baseline tests fail; fix them before running the mutation check.');
      console.error(base.out.split('\n').slice(-30).join('\n'));
      process.exit(2);
    }

    for (const m of list) {
      const target = join(work, m.file);
      const original = readFileSync(target, 'utf8');
      const count = original.split(m.find).length - 1;
      if (count !== 1) {
        rows.push({ ...m, result: `INVALID (find occurs ${count} times)` });
        console.log(`${m.id}: INVALID patch (${count} matches)`);
        continue;
      }
      writeFileSync(target, original.replace(m.find, () => m.replace));
      const r = runTests(work, m.tests);
      writeFileSync(target, original);
      const killed = r.code !== 0;
      rows.push({ ...m, result: killed ? 'KILLED' : 'SURVIVED' });
      console.log(`${m.id}: ${killed ? 'KILLED' : 'SURVIVED'}  (${m.desc})`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const survived = rows.filter((r) => r.result !== 'KILLED');
  console.log(`\n${rows.length - survived.length}/${rows.length} mutations killed.`);

  if (write && !only) {
    const lines = [
      '# Mutation Check Results',
      '',
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      `Node.js: ${process.version}`,
      '',
      'Produced by `node scripts/validation/mutation-check.js --write`. For each row the script copies',
      '`reviewer/` and `tests/` to a temp directory, applies one patch that disables the guardrail,',
      'runs the covering test files and requires them to fail. The working tree is not modified.',
      'KILLED means a test failed when the guardrail was disabled (the desired outcome).',
      'SURVIVED means no test noticed (a gap).',
      '',
      '| ID | File | Disabling patch | Tests run | Result |',
      '|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.id} | ${r.file.replace('reviewer/src/', '')} | ${r.desc} | ${r.tests.map((t) => t.replace('tests/', '').replace('.test.js', '')).join(', ')} | ${r.result} |`),
      '',
      `Summary: ${rows.length - survived.length} of ${rows.length} mutations killed.`,
      '',
    ];
    writeFileSync(OUT, lines.join('\n'));
    console.log(`Wrote ${OUT}`);
  }
  process.exit(survived.length === 0 ? 0 : 1);
}

main();
