// stages.js
// The three stages of a review, each usable on its own (one GitHub Actions job each, ADR 0012) or
// chained in one process (local runs and the offline tests, see main.js).
//
//   prepareStage  holds only the read token. Gates, diff, rules, redaction, prompt. Never posts.
//   reviewStage   holds only the Bob key. Runs Bob in a scrubbed environment and returns raw output.
//   publishStage  holds only the comment token. Treats the review result as untrusted input.
//
// Stage functions never call process.exit (except the unrecoverable scratch failure, kept from the
// original flow); callers decide what the exit code is. No runtime dependencies.

import { makeGithubClient }   from './github.js';
import { checkHeadPin, checkAuthor, checkDraft, checkSizes, checkPaths, checkBudget } from './gate.js';
import { loadRules }          from './rules.js';
import { redactDiff }         from './redact.js';
import { buildPrompt }        from './prompt.js';
import { createScratch, handOverScratch } from './scratch.js';
import { runBob, getBobVersion, bobUserFromEnv } from './runBob.js';
import { parseOutput }        from './parseOutput.js';
import { validateFindings }   from './validate.js';
import { triageFindings }     from './triage.js';
import { sanitiseOutput }     from './sanitise.js';
import { renderComment, renderUnavailableComment, parseMarker } from './render.js';
import { upsertComment }      from './publish.js';
import { buildCostRecord, runIdFromEnv } from './cost.js';
import { logGateSkipped, logPrepareDone, logBobStarted, logBobFinished, logPublishDone } from './audit.js';
import { rmSync } from 'node:fs';

const MARKER_PREFIX = '<!-- bob-pr-review:v1 ';
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const VERSION_RE = /^\d+\.\d+\.\d+[\w.+-]*$/;
// Upper bound on the raw Bob output accepted by publish (the result artifact is untrusted input).
export const MAX_RESULT_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

// prepareStage returns a handoff object (JSON-serialisable):
//   proceed: true  -> prompt, redactedDiff, ruleIds and counters are set; run the review stage.
//   proceed: false -> outcome says why; post, when set, is a short note for the publish stage.
export async function prepareStage(env, config, { repo, prNumber, headSha }) {
  const t0 = Date.now();
  const base = { schema_version: 1, repo, prNumber, headSha };
  const stop = (outcome, post = null) => ({ ...base, proceed: false, outcome, post, prepareMs: Date.now() - t0 });
  const readClient = makeGithubClient(config.apiBase, env.SCM_READ_TOKEN);

  let pr, diff;
  try {
    pr = await readClient.getPR(repo, prNumber);
  } catch (err) {
    process.stderr.write(`[prepare] failed to fetch PR: ${err.message}\n`);
    return stop('bob_unavailable', { outcome: 'bob_unavailable', detail: err.message, runs: 1, withCost: true });
  }

  // Head pin (G32), author (G7), draft (G9).
  for (const gate of [checkHeadPin(pr, headSha), checkAuthor(pr), checkDraft(pr)]) {
    if (gate) {
      logGateSkipped(gate.outcome, gate.reason);
      return stop(gate.outcome);
    }
  }

  try {
    diff = await readClient.getPRDiff(repo, prNumber);
  } catch (err) {
    process.stderr.write(`[prepare] failed to fetch diff: ${err.message}\n`);
    return stop('bob_unavailable', { outcome: 'bob_unavailable', detail: err.message, runs: 1, withCost: true });
  }

  const diffBytes = Buffer.byteLength(diff, 'utf8');
  const changedFiles = extractChangedFilePaths(diff);

  // Size gates (G8): a short note is posted by the publish stage.
  const sizeGate = checkSizes(changedFiles.length, diffBytes, config);
  if (sizeGate) {
    logGateSkipped(sizeGate.outcome, sizeGate.reason);
    return stop(sizeGate.outcome, { outcome: sizeGate.outcome, detail: sizeGate.reason, runs: 1, withCost: false });
  }

  // Path gate (G9).
  const pathGate = checkPaths(changedFiles);
  if (pathGate) {
    logGateSkipped(pathGate.outcome, pathGate.reason);
    return stop(pathGate.outcome);
  }

  // Existing marker comment: prior run count and spend (G14). Non-fatal if the listing fails.
  let existingComments = [];
  try {
    existingComments = await readClient.listComments(repo, prNumber);
  } catch {
    // treat as no existing comment
  }
  const markerComment = existingComments.find(c => (c.body ?? '').trimStart().startsWith(MARKER_PREFIX));
  const existingMeta = markerComment ? parseMarker(markerComment.body) : null;
  const priorRuns  = existingMeta?.runs ?? 0;
  const priorSpend = existingMeta?.cost_total?.bobcoins ?? 0;

  // Budget gate (G14): only the per-PR run cap exists (ADR 0009). An existing marker comment already
  // holds the last review, so it is not overwritten with a note.
  const budgetGate = checkBudget(priorRuns, config);
  if (budgetGate) {
    logGateSkipped(budgetGate.outcome, budgetGate.reason);
    return stop(budgetGate.outcome, markerComment ? null : {
      outcome: budgetGate.outcome, detail: budgetGate.reason, runs: priorRuns + 1, withCost: false,
    });
  }

  // Rules from the base branch (G33).
  let rules;
  try {
    rules = await loadRules(readClient, repo, pr.base.ref);
  } catch (err) {
    process.stderr.write(`[prepare] failed to load rules: ${err.message}\n`);
    rules = { standards: null, projectRules: null, security: null, config: null, ruleIds: new Set() };
  }

  const redactedDiff = redactDiff(diff); // G15
  const { prompt } = buildPrompt({
    diff: redactedDiff,
    rules,
    meta: { baseBranch: pr.base?.ref, headBranch: pr.head?.ref, authorAssociation: pr.author_association },
    maxBytes: config.maxPromptBytes,
  });
  const promptBytes = Buffer.byteLength(prompt, 'utf8');
  logPrepareDone(changedFiles.length, diffBytes, promptBytes);

  return {
    ...base,
    proceed: true,
    outcome: null,
    post: null,
    prepareMs: Date.now() - t0,
    prompt,
    redactedDiff,
    ruleIds: [...rules.ruleIds],
    rulesStatus: { standards: !!rules.standards, teamRules: !!rules.projectRules },
    priorRuns,
    priorSpend,
    inputs: { files: changedFiles.length, diffBytes, promptBytes },
  };
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

// reviewStage runs Bob on the prepared prompt and returns the raw outcome. The result is plain data:
// the publish stage never trusts it. Holds BOB_API_KEY only; no SCM token is read here.
export async function reviewStage(env, config, handoff) {
  const bobUser = bobUserFromEnv(env);
  const imageDigest = SHA256_RE.test(env.REVIEW_IMAGE_DIGEST ?? '') ? env.REVIEW_IMAGE_DIGEST : null;

  let scratchDir;
  try {
    scratchDir = createScratch(); // G28
    if (bobUser) handOverScratch(scratchDir, bobUser.uid, bobUser.gid);
  } catch (err) {
    process.stderr.write(`[review] failed to create scratch: ${err.message}\n`);
    process.exit(1);
  }

  const t0 = Date.now();
  const bobVersion = await getBobVersion({ bobBin: config.bobBin, parentEnv: env, bobUser });
  logBobStarted();
  let bobResult;
  try {
    bobResult = await runBob({
      bobBin: config.bobBin,
      scratchDir,
      promptText: handoff.prompt,
      timeoutSeconds: config.bobTimeoutSeconds,
      parentEnv: env,
      bobUser,
    });
  } catch (err) {
    process.stderr.write(`[review] failed to spawn Bob: ${err.message}\n`);
    cleanScratch(scratchDir);
    return { schema_version: 1, spawnError: err.message, stdout: '', exitCode: null, timedOut: false,
             durationMs: 0, stageMs: Date.now() - t0, bobVersion, imageDigest };
  }

  logBobFinished(bobResult.exitCode, bobResult.durationMs);
  cleanScratch(scratchDir);
  return {
    schema_version: 1,
    spawnError: null,
    stdout: bobResult.stdout,
    exitCode: bobResult.exitCode,
    timedOut: bobResult.timedOut,
    durationMs: bobResult.durationMs,
    stageMs: Date.now() - t0,
    bobVersion,
    imageDigest,
  };
}

// validateResult checks the shape of a result read from an artifact. The artifact is untrusted:
// anything off-shape is rejected. Returns { result } or { error }.
export function validateResult(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'result is not an object' };
  const { stdout, exitCode, timedOut, durationMs, stageMs, bobVersion, imageDigest, spawnError } = raw;
  if (typeof stdout !== 'string') return { error: 'stdout is not a string' };
  if (Buffer.byteLength(stdout, 'utf8') > MAX_RESULT_BYTES) return { error: 'result is too large' };
  if (!(exitCode === null || Number.isInteger(exitCode))) return { error: 'exitCode is invalid' };
  if (typeof timedOut !== 'boolean') return { error: 'timedOut is invalid' };
  for (const [name, v] of [['durationMs', durationMs], ['stageMs', stageMs]]) {
    if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) return { error: `${name} is invalid` };
  }
  if (!(bobVersion === null || (typeof bobVersion === 'string' && VERSION_RE.test(bobVersion)))) return { error: 'bobVersion is invalid' };
  if (!(imageDigest === null || (typeof imageDigest === 'string' && SHA256_RE.test(imageDigest)))) return { error: 'imageDigest is invalid' };
  if (!(spawnError === null || typeof spawnError === 'string')) return { error: 'spawnError is invalid' };
  return { result: { stdout, exitCode, timedOut, durationMs, stageMs, bobVersion, imageDigest, spawnError } };
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

// publishStage posts or updates the single marker comment. `result` is the validated review result,
// or { missing: true } when the review job produced nothing, or { invalid: '<reason>' }.
// Returns { outcome, costRecord }.
export async function publishStage(env, config, handoff, result) {
  const t0 = Date.now();
  const { repo, prNumber, headSha } = handoff;
  const commentClient = makeGithubClient(config.apiBase, env.SCM_COMMENT_TOKEN);
  const totalMs = () => (handoff.prepareMs ?? 0) + (result?.stageMs ?? 0) + (Date.now() - t0);

  // Stages that ended early: post the short note, if one is wanted.
  if (!handoff.proceed) {
    const p = handoff.post;
    if (!p) return { outcome: handoff.outcome, costRecord: null };
    const costRec = p.withCost
      ? buildCostRecord({ repo, pr: prNumber, headSha, stats: null, inputs: null, outputMeta: null,
          totalMs: totalMs(), bobVersion: null, imageDigest: null, outcome: p.outcome })
      : null;
    const body = renderUnavailableComment({ headSha, runs: p.runs, costRecord: costRec, outcome: p.outcome, detail: p.detail });
    await safeUpsert(commentClient, repo, prNumber, body);
    return { outcome: p.outcome, costRecord: costRec };
  }

  const { priorRuns, priorSpend, inputs } = handoff;
  const ruleIds = new Set(handoff.ruleIds);
  const unavailable = async (outcome, detail, stats, outputMeta, bobVersion, imageDigest) => {
    const costRec = buildCostRecord({
      repo, pr: prNumber, headSha, stats, inputs, outputMeta,
      totalMs: totalMs(), bobVersion, imageDigest, outcome,
    });
    const body = renderUnavailableComment({
      headSha, runs: priorRuns + 1, costRecord: costRec, outcome, detail, priorCostBobcoins: priorSpend,
    });
    await safeUpsert(commentClient, repo, prNumber, body);
    return { outcome, costRecord: costRec };
  };

  if (result?.missing) return unavailable('bob_unavailable', 'the review job produced no result', null, null, null, null);
  if (result?.invalid) return unavailable('bad_model_output', `the review result was rejected: ${result.invalid}`, null, null, null, null);
  const { bobVersion, imageDigest } = result;
  if (result.spawnError) return unavailable('bob_unavailable', result.spawnError, null, null, bobVersion, imageDigest);

  let parsed, stats;
  try {
    ({ parsed, stats } = parseOutput(result.stdout, result.exitCode, result.timedOut));
  } catch (err) {
    return unavailable(err.outcome ?? 'bob_unavailable', err.message, null, null, bobVersion, imageDigest);
  }

  let validated;
  try {
    ({ valid: validated } = validateFindings(parsed, handoff.redactedDiff, ruleIds));
  } catch (err) {
    return unavailable('bad_model_output', err.message, stats,
      { bytes: result.stdout.length, findingsKept: 0, findingsDropped: 0 }, bobVersion, imageDigest);
  }

  const triaged = { ...validated, findings: triageFindings(validated.findings, config.maxFindingsPerCategory, config.maxFindingsTotal) };
  const sanitised = sanitiseOutput(triaged);
  const findingsKept = sanitised.findings.length;
  const findingsDropped = (parsed.findings?.length ?? 0) - findingsKept;

  const costRecord = buildCostRecord({
    repo, pr: prNumber, headSha, stats, inputs,
    outputMeta: { bytes: Buffer.byteLength(JSON.stringify(sanitised), 'utf8'), findingsKept, findingsDropped },
    totalMs: totalMs(), bobVersion, imageDigest, outcome: 'reviewed',
  });

  const commentBody = renderComment({
    headSha,
    runs: priorRuns + 1,
    costRecord,
    output: sanitised,
    rulesStatus: handoff.rulesStatus,
    bobVersion,
    runId: runIdFromEnv(env),
    priorCostBobcoins: priorSpend,
  });

  try {
    const published = await upsertComment(commentClient, repo, prNumber, commentBody);
    logPublishDone(published.action);
  } catch (err) {
    process.stderr.write(`[publish] publish failed: ${err.message}\n`);
    return { outcome: 'publish_failed', costRecord };
  }
  return { outcome: 'reviewed', costRecord };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractChangedFilePaths(diff) {
  const files = [];
  const re = /^\+\+\+ b\/(.+)$/gm;
  let m;
  while ((m = re.exec(diff)) !== null) files.push(m[1]);
  return files;
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
