// audit.js
// Guardrails: G20 (structured audit log per event), G27 (secrets never printed)
// Emits one JSON line per event to stdout. Scrubs secret values before emission.
// Never includes PR diff, file contents, or model output text in log lines.
// No runtime dependencies.

// Collected secret values to scrub. Call registerSecrets() at startup.
const _secrets = new Set();

// registerSecrets adds raw secret values that must never appear in log output.
// Call with the actual values (not names) of BOB_API_KEY, SCM_READ_TOKEN, etc.
export function registerSecrets(values) {
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0) _secrets.add(v);
  }
}

// scrub replaces any occurrence of a registered secret value with [SCRUBBED]. (G27)
export function scrub(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const s of _secrets) {
    // Use a simple string replacement to avoid regex special-char issues.
    // Secrets can contain regex metacharacters so we replace literally.
    out = out.split(s).join('[SCRUBBED]');
  }
  return out;
}

function scrubObj(obj) {
  if (typeof obj === 'string') return scrub(obj);
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = scrubObj(v);
  }
  return out;
}

// emit writes one JSON audit line to stdout. (G20)
function emit(level, event, fields) {
  const line = JSON.stringify(scrubObj({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  }));
  process.stdout.write(line + '\n');
}

// Event emitters (one per event type from CONTRACTS section 7).
// PR content (diff, file bodies, model text) must NEVER be passed as a field.

export function logRunStart(repo, pr, headSha) {
  emit('info', 'run_start', { repo, pr, head_sha: headSha });
}

export function logInputRejected(reason) {
  emit('warn', 'input_rejected', { reason });
}

export function logGateSkipped(reason, detail) {
  emit('info', 'gate_skipped', { reason, detail: detail ?? null });
}

export function logPrepareDone(fileCount, diffBytes, promptBytes) {
  emit('info', 'prepare_done', { file_count: fileCount, diff_bytes: diffBytes, prompt_bytes: promptBytes });
}

export function logBobStarted() {
  emit('info', 'bob_started', {});
}

export function logBobFinished(exitCode, durationMs) {
  emit('info', 'bob_finished', { exit_code: exitCode, duration_ms: durationMs });
}

export function logPublishDone(action) {
  emit('info', 'publish_done', { action });
}

export function logRunSummary(repo, pr, headSha, outcome, costRecord) {
  emit('info', 'run_summary', { repo, pr, head_sha: headSha, outcome, cost: costRecord });
}
