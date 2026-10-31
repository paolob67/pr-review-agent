// main.js
// Orchestrates a review. Two ways to run it (ADR 0012):
//   main(env)                      all three stages in one process (local runs and offline tests)
//   main(env, { stage, dir })      one stage, exchanging files in `dir` (one GitHub Actions job each)
//
// Stage files in `dir` (CONTRACTS section 2 artifacts):
//   handoff.json  written by prepare; read by review (prompt) and publish (everything else)
//   result.json   written by review; read by publish, which treats it as untrusted
//   audit.json    written by publish: outcome and cost record
//
// Handles all outcomes from CONTRACTS section 8.
// Exits 0 for all expected outcomes; exits 1 only on unexpected crashes.
// No runtime dependencies.

import { getConfig }          from './config.js';
import { validateInputs, InputError } from './input.js';
import { prepareStage, reviewStage, publishStage, validateResult, MAX_RESULT_BYTES } from './stages.js';
import {
  registerSecrets,
  logRunStart, logInputRejected, logRunSummary,
} from './audit.js';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const STAGES = ['prepare', 'review', 'publish'];
const HANDOFF = 'handoff.json';
const RESULT = 'result.json';
const AUDIT = 'audit.json';
const MAX_HANDOFF_BYTES = 8 * 1024 * 1024;

export async function main(env = process.env, { stage = null, dir = null } = {}) {
  // Register secrets for log scrubbing. (G27)
  registerSecrets([
    env.BOB_API_KEY, env.SCM_READ_TOKEN, env.SCM_COMMENT_TOKEN,
    env.CANARY_SCM_TEST,
  ].filter(Boolean));

  if (stage !== null && !STAGES.includes(stage)) {
    process.stderr.write(`[main] unknown stage: ${String(stage).slice(0, 40)}\n`);
    process.exit(1);
  }
  if (stage !== null && !dir) {
    process.stderr.write('[main] a stage needs an exchange directory\n');
    process.exit(1);
  }

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
  let inputs;
  try {
    inputs = validateInputs(env);
  } catch (err) {
    if (err instanceof InputError) {
      logInputRejected(err.message);
      logRunSummary('?', 0, '?', 'rejected_input', null);
      process.exit(0);
    }
    throw err;
  }
  const { repo, prNumber, headSha } = inputs;
  logRunStart(repo, prNumber, headSha);

  // --- Single process: the original flow ---
  if (stage === null) {
    const handoff = await prepareStage(env, config, inputs);
    const result = handoff.proceed ? await reviewStage(env, config, handoff) : null;
    const done = await publishStage(env, config, handoff, result);
    logRunSummary(repo, prNumber, headSha, done.outcome, done.costRecord);
    process.exit(0);
  }

  mkdirSync(dir, { recursive: true });

  // --- Stage: prepare (read token only) ---
  if (stage === 'prepare') {
    const handoff = await prepareStage(env, config, inputs);
    writeFileSync(join(dir, HANDOFF), JSON.stringify(handoff), { mode: 0o600 });
    if (!handoff.proceed) logRunSummary(repo, prNumber, headSha, handoff.outcome, null);
    process.exit(0);
  }

  // The remaining stages start from the handoff written by prepare.
  const handoff = readJson(join(dir, HANDOFF), MAX_HANDOFF_BYTES);
  if (!handoff || handoff.repo !== repo || handoff.prNumber !== prNumber || handoff.headSha !== headSha) {
    // The artifact does not belong to this run's validated inputs: do nothing.
    process.stderr.write('[main] handoff is missing or does not match the run inputs\n');
    logRunSummary(repo, prNumber, headSha, 'rejected_input', null);
    process.exit(0);
  }

  // --- Stage: review (Bob key only) ---
  if (stage === 'review') {
    if (!handoff.proceed) {
      // Nothing to review; publish decides what to post.
      process.exit(0);
    }
    const result = await reviewStage(env, config, handoff);
    writeFileSync(join(dir, RESULT), JSON.stringify(result), { mode: 0o600 });
    process.exit(0);
  }

  // --- Stage: publish (comment token only; the result is untrusted) ---
  let result = null;
  if (handoff.proceed) {
    const raw = readJson(join(dir, RESULT), MAX_RESULT_BYTES + 4096);
    if (raw === null) result = { missing: true };
    else {
      const checked = validateResult(raw);
      result = checked.error ? { invalid: checked.error } : checked.result;
    }
  }
  const done = await publishStage(env, config, handoff, result);
  writeFileSync(join(dir, AUDIT), JSON.stringify({ outcome: done.outcome, cost: done.costRecord }), { mode: 0o600 });
  logRunSummary(repo, prNumber, headSha, done.outcome, done.costRecord);
  process.exit(0);
}

// readJson reads a size-limited JSON file; null when it is missing, too big or not JSON.
function readJson(path, maxBytes) {
  try {
    if (statSync(path).size > maxBytes) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export default main;
