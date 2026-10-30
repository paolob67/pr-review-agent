// main.js
// Orchestrates the three stages: Prepare, Review, Publish.
// Handles all outcomes from CONTRACTS section 8.
// Exits 0 for all expected outcomes; exits 1 only on unexpected crashes.
// No runtime dependencies.

import { getConfig }          from './config.js';
import { validateInputs, InputError } from './input.js';
import { makeGithubClient }   from './github.js';
import { checkHeadPin, checkAuthor, checkDraft, checkSizes, checkPaths, checkBudget } from './gate.js';
import { loadRules }          from './rules.js';
import { redactDiff }         from './redact.js';
import { buildPrompt }        from './prompt.js';
import { createScratch }      from './scratch.js';
import { runBob, getBobVersion } from './runBob.js';
import { parseOutput, ParseError } from './parseOutput.js';
import { validateFindings, ValidationError } from './validate.js';
import { triageFindings }     from './triage.js';
import { sanitiseOutput }     from './sanitise.js';
import { renderComment, renderUnavailableComment, parseMarker } from './render.js';
import { upsertComment }      from './publish.js';
import { buildCostRecord }    from './cost.js';
import {
  registerSecrets,
  logRunStart, logInputRejected, logGateSkipped, logPrepareDone,
  logBobStarted, logBobFinished, logPublishDone, logRunSummary,
} from './audit.js';
import { rmSync } from 'node:fs';

export async function main(env = process.env) {
  const startMs = Date.now();

  // Register secrets for log scrubbing. (G27)
  registerSecrets([
    env.BOB_API_KEY, env.SCM_READ_TOKEN, env.SCM_COMMENT_TOKEN,
    env.CANARY_SCM_TEST,
  ].filter(Boolean));

  let config;
  try {
    // Pass env to getConfig so tests can override configuration via the env param.
    config = getConfig(env);
  } catch (err) {
    process.stderr.write(`[main] config error: ${err.message}\n`);
    process.exit(1);
  }

  // Kill switch (G10).
  if (!config.enabled) {
    logRunSummary('unknown', 0, 'unknown', 'skipped_disabled', null);
    process.exit(0);
  }

  // --- Input validation (G24) ---
  let repo, prNumber, headSha;
  try {
    ({ repo, prNumber, headSha } = validateInputs(env));
  } catch (err) {
    if (err instanceof InputError) {
      logInputRejected(err.message);
      logRunSummary('?', 0, '?', 'rejected_input', null);
      process.exit(0);
    }
    throw err;
  }

  logRunStart(repo, prNumber, headSha);

  // --- Stage 1: Prepare ---
  const readClient = makeGithubClient(config.apiBase, env.SCM_READ_TOKEN);

  let pr, diff, rules, existingMeta;

  // Fetch PR metadata and check head pin. (G32)
  try {
    pr = await readClient.getPR(repo, prNumber);
  } catch (err) {
    process.stderr.write(`[main] failed to fetch PR: ${err.message}\n`);
    await tryPostUnavailable(config, env, repo, prNumber, headSha, 'bob_unavailable', err.message, startMs);
    process.exit(0);
  }

  const stale = checkHeadPin(pr, headSha);
  if (stale) {
    logGateSkipped(stale.outcome, stale.reason);
    logRunSummary(repo, prNumber, headSha, stale.outcome, null);
    process.exit(0);
  }

  // Author gate. (G7)
  const authorGate = checkAuthor(pr);
  if (authorGate) {
    logGateSkipped(authorGate.outcome, authorGate.reason);
    logRunSummary(repo, prNumber, headSha, authorGate.outcome, null);
    process.exit(0);
  }

  // Draft gate. (G9)
  const draftGate = checkDraft(pr);
  if (draftGate) {
    logGateSkipped(draftGate.outcome, draftGate.reason);
    logRunSummary(repo, prNumber, headSha, draftGate.outcome, null);
    process.exit(0);
  }

  // Fetch diff.
  try {
    diff = await readClient.getPRDiff(repo, prNumber);
  } catch (err) {
    process.stderr.write(`[main] failed to fetch diff: ${err.message}\n`);
    await tryPostUnavailable(config, env, repo, prNumber, headSha, 'bob_unavailable', err.message, startMs);
    process.exit(0);
  }

  const diffBytes  = Buffer.byteLength(diff, 'utf8');
  const changedFiles = extractChangedFilePaths(diff);

  // Size gates. (G8)
  const sizeGate = checkSizes(changedFiles.length, diffBytes, config);
  if (sizeGate) {
    logGateSkipped(sizeGate.outcome, sizeGate.reason);
    const commentClient = makeGithubClient(config.apiBase, env.SCM_COMMENT_TOKEN);
    const body = renderUnavailableComment({
      headSha, runs: 1, costRecord: null, outcome: sizeGate.outcome, detail: sizeGate.reason,
    });
    await safeUpsert(commentClient, repo, prNumber, body);
    logRunSummary(repo, prNumber, headSha, sizeGate.outcome, null);
    process.exit(0);
  }

  // Path gate. (G9)
  const pathGate = checkPaths(changedFiles);
  if (pathGate) {
    logGateSkipped(pathGate.outcome, pathGate.reason);
    logRunSummary(repo, prNumber, headSha, pathGate.outcome, null);
    process.exit(0);
  }

  // Fetch existing comment to check budget and prior run count. (G14)
  const commentClient = makeGithubClient(config.apiBase, env.SCM_COMMENT_TOKEN);
  let existingComments = [];
  try {
    existingComments = await commentClient.listComments(repo, prNumber);
  } catch {
    // Non-fatal; treat as no existing comment.
  }

  const markerComment = existingComments.find(c => (c.body ?? '').trimStart().startsWith('<!-- bob-pr-review:v1 '));
  existingMeta = markerComment ? parseMarker(markerComment.body) : null;
  const priorRuns  = existingMeta?.runs ?? 0;
  const priorSpend = existingMeta?.cost_total?.bobcoins ?? 0;

  // Budget gate. (G14)
  // Only the per-PR run cap exists; the run count comes from the marker comment (ADR 0009).
  const budgetGate = checkBudget(priorRuns, config);
  if (budgetGate) {
    logGateSkipped(budgetGate.outcome, budgetGate.reason);
    // An existing marker comment already holds the last review; do not overwrite it with a note.
    if (!markerComment) {
      const body = renderUnavailableComment({
        headSha, runs: priorRuns + 1, costRecord: null,
        outcome: budgetGate.outcome, detail: budgetGate.reason,
      });
      await safeUpsert(commentClient, repo, prNumber, body);
    }
    logRunSummary(repo, prNumber, headSha, budgetGate.outcome, null);
    process.exit(0);
  }

  // Load rules from base branch. (G33)
  try {
    rules = await loadRules(readClient, repo, pr.base.ref);
  } catch (err) {
    process.stderr.write(`[main] failed to load rules: ${err.message}\n`);
    rules = { standards: null, projectRules: null, security: null, config: null, ruleIds: new Set() };
  }

  // Redact diff. (G15)
  const redactedDiff = redactDiff(diff);

  // Build prompt.
  const { prompt, truncated } = buildPrompt({
    diff: redactedDiff,
    rules,
    meta: {
      baseBranch: pr.base?.ref,
      headBranch: pr.head?.ref,
      authorAssociation: pr.author_association,
    },
    maxBytes: config.maxPromptBytes,
  });

  const promptBytes = Buffer.byteLength(prompt, 'utf8');
  logPrepareDone(changedFiles.length, diffBytes, promptBytes);

  // Create scratch directory. (G28)
  let scratchDir;
  try {
    scratchDir = createScratch();
  } catch (err) {
    process.stderr.write(`[main] failed to create scratch: ${err.message}\n`);
    process.exit(1);
  }

  // --- Stage 2: Review ---
  const bobVersion = await getBobVersion({ bobBin: config.bobBin, parentEnv: env });
  logBobStarted();
  let bobResult;
  try {
    bobResult = await runBob({
      bobBin: config.bobBin,
      scratchDir,
      promptText: prompt,
      timeoutSeconds: config.bobTimeoutSeconds,
      parentEnv: env,
    });
  } catch (err) {
    process.stderr.write(`[main] failed to spawn Bob: ${err.message}\n`);
    await tryPostUnavailable(config, env, repo, prNumber, headSha, 'bob_unavailable', err.message, startMs);
    cleanScratch(scratchDir);
    process.exit(0);
  }

  logBobFinished(bobResult.exitCode, bobResult.durationMs);
  cleanScratch(scratchDir);

  let parsed, stats, validated, triaged, sanitised;
  const totalMs = Date.now() - startMs;

  // --- Stage 3: Publish ---
  try {
    ({ parsed, stats } = parseOutput(bobResult.stdout, bobResult.exitCode, bobResult.timedOut));
  } catch (err) {
    const outcome = err.outcome ?? 'bob_unavailable';
    const costRec = buildCostRecord({
      repo, pr: prNumber, headSha, stats: null, inputs: { files: changedFiles.length, diffBytes, promptBytes },
      outputMeta: null, totalMs, bobVersion, imageDigest: null, outcome,
    });
    const body = renderUnavailableComment({ headSha, runs: priorRuns + 1, costRecord: costRec, outcome, detail: err.message, priorCostBobcoins: priorSpend });
    await safeUpsert(commentClient, repo, prNumber, body);
    logRunSummary(repo, prNumber, headSha, outcome, costRec);
    process.exit(0);
  }

  try {
    ({ valid: validated, dropped: _droppedCount, movedToAttention: _movedCount } =
      validateFindings(parsed, redactedDiff, rules.ruleIds));
  } catch (err) {
    const outcome = 'bad_model_output';
    const costRec = buildCostRecord({
      repo, pr: prNumber, headSha, stats, inputs: { files: changedFiles.length, diffBytes, promptBytes },
      outputMeta: { bytes: bobResult.stdout.length, findingsKept: 0, findingsDropped: 0 },
      totalMs, bobVersion, imageDigest: null, outcome,
    });
    const body = renderUnavailableComment({ headSha, runs: priorRuns + 1, costRecord: costRec, outcome, detail: err.message, priorCostBobcoins: priorSpend });
    await safeUpsert(commentClient, repo, prNumber, body);
    logRunSummary(repo, prNumber, headSha, outcome, costRec);
    process.exit(0);
  }

  triaged = { ...validated, findings: triageFindings(validated.findings, config.maxFindingsPerCategory, config.maxFindingsTotal) };
  sanitised = sanitiseOutput(triaged);

  const findingsKept    = sanitised.findings.length;
  const findingsDropped = (parsed.findings?.length ?? 0) - findingsKept;
  const outputBytes     = Buffer.byteLength(JSON.stringify(sanitised), 'utf8');

  const costRecord = buildCostRecord({
    repo, pr: prNumber, headSha, stats,
    inputs: { files: changedFiles.length, diffBytes, promptBytes },
    outputMeta: { bytes: outputBytes, findingsKept, findingsDropped },
    totalMs, bobVersion, imageDigest: null, outcome: 'reviewed',
  });

  const rulesStatus = {
    standards: !!rules.standards,
    teamRules: !!rules.projectRules,
  };

  const runs = priorRuns + 1;
  const commentBody = renderComment({
    headSha,
    runs,
    costRecord,
    output: sanitised,
    rulesStatus,
    bobVersion,
    runId: env.CE_JOBRUN ?? 'local',
    priorCostBobcoins: priorSpend,
  });

  let publishResult;
  try {
    publishResult = await upsertComment(commentClient, repo, prNumber, commentBody);
    logPublishDone(publishResult.action);
  } catch (err) {
    process.stderr.write(`[main] publish failed: ${err.message}\n`);
    logRunSummary(repo, prNumber, headSha, 'publish_failed', costRecord);
    process.exit(0);
  }

  logRunSummary(repo, prNumber, headSha, 'reviewed', costRecord);
  process.exit(0);
}

// --- Helpers ---

function extractChangedFilePaths(diff) {
  const files = [];
  const re = /^\+\+\+ b\/(.+)$/gm;
  let m;
  while ((m = re.exec(diff)) !== null) {
    files.push(m[1]);
  }
  return files;
}

async function tryPostUnavailable(config, env, repo, prNumber, headSha, outcome, detail, startMs) {
  try {
    const commentClient = makeGithubClient(config.apiBase, env.SCM_COMMENT_TOKEN);
    const costRec = buildCostRecord({
      repo, pr: prNumber, headSha, stats: null, inputs: null, outputMeta: null,
      totalMs: Date.now() - startMs, bobVersion: null, imageDigest: null, outcome,
    });
    const body = renderUnavailableComment({ headSha, runs: 1, costRecord: costRec, outcome, detail });
    await upsertComment(commentClient, repo, prNumber, body);
  } catch {
    // Best-effort; ignore failures.
  }
}

async function safeUpsert(commentClient, repo, prNumber, body) {
  try {
    await upsertComment(commentClient, repo, prNumber, body);
  } catch {
    // Best-effort.
  }
}

function cleanScratch(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

let _droppedCount = 0;
let _movedCount   = 0;

export default main;
