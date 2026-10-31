// cost.js
// Guardrails: G37 (per-PR cost record produced for every run)
// Builds the cost record JSON as defined in CONTRACTS section 6.
// bob_usage.total comes from stats.session_costs in Bob JSON output (confirmed S7).
// Runner compute is recorded as time, not currency (ADR 0012): the runner label and, once the
// workflow reports it, the billed minutes.
// No runtime dependencies.

const RUNNER_LABEL = 'ubuntu-24.04';

// runIdFromEnv returns "<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>" on a runner, or a placeholder locally.
export function runIdFromEnv(env = process.env) {
  const id = env.GITHUB_RUN_ID;
  if (!id || !/^[0-9]{1,20}$/.test(id)) return 'local-test';
  const attempt = /^[0-9]{1,4}$/.test(env.GITHUB_RUN_ATTEMPT ?? '') ? env.GITHUB_RUN_ATTEMPT : '1';
  return `${id}-${attempt}`;
}

// buildCostRecord constructs a CONTRACTS-section-6 cost record. (G37)
//
// Parameters:
//   repo       - "owner/name"
//   pr         - PR number (integer)
//   headSha    - 40-hex SHA
//   stats      - Bob JSON stats object (session_costs, duration_ms, tool_calls, task_id)
//   inputs     - { files, diffBytes, promptBytes }
//   outputMeta - { bytes, findingsKept, findingsDropped }
//   totalMs    - total job wall-clock duration in milliseconds
//   bobVersion - Bob Shell version string (e.g. "2.0.9"); may be null if unknown
//   imageDigest - container image digest; may be null
//   outcome    - job outcome string from CONTRACTS section 8
export function buildCostRecord({
  repo, pr, headSha, stats, inputs, outputMeta,
  totalMs, bobVersion, imageDigest, outcome,
}) {
  const runId = runIdFromEnv(process.env);

  const bobUsage = stats
    ? {
        source: 'reported',
        unit: 'bobcoins',
        input: null,   // Bob v2 does not report token breakdown (S7)
        output: null,
        total: typeof stats.session_costs === 'number' ? stats.session_costs : null,
      }
    : { source: 'reported', unit: 'bobcoins', input: null, output: null, total: null };

  const totalSec  = totalMs != null ? +(totalMs / 1000).toFixed(3) : null;
  const bobMs     = stats?.duration_ms;
  const bobSec    = bobMs  != null ? +(bobMs / 1000).toFixed(3) : null;

  return {
    schema_version: 1,
    repo,
    pr,
    head_sha: headSha,
    run_id: runId,
    bob_shell_version: bobVersion ?? null,
    image_digest: imageDigest ?? null,
    inputs: {
      files: inputs?.files ?? null,
      diff_bytes: inputs?.diffBytes ?? null,
      prompt_bytes: inputs?.promptBytes ?? null,
    },
    output: {
      bytes: outputMeta?.bytes ?? null,
      findings_kept: outputMeta?.findingsKept ?? null,
      findings_dropped: outputMeta?.findingsDropped ?? null,
    },
    bob_usage: bobUsage,
    duration_seconds: {
      total: totalSec,
      bob: bobSec,
    },
    compute: {
      runner: RUNNER_LABEL,
      runner_minutes: null,
    },
    outcome,
  };
}

export default buildCostRecord;
