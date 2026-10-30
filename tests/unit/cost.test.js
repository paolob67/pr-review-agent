// tests/unit/cost.test.js
// Unit tests for cost.js
// Guardrails covered: G37 (per-PR cost record)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCostRecord } from '../../reviewer/src/cost.js';

const BASE_ARGS = {
  repo: 'owner/repo',
  pr: 42,
  headSha: 'a'.repeat(40),
  stats: { task_id: 'test', duration_ms: 18400, session_costs: 0.118, max_cost: 1.0, tool_calls: 0 },
  inputs: { files: 7, diffBytes: 18234, promptBytes: 61234 },
  outputMeta: { bytes: 5120, findingsKept: 6, findingsDropped: 2 },
  totalMs: 24200,
  bobVersion: '2.0.9',
  imageDigest: 'sha256:abc123',
  outcome: 'reviewed',
};

describe('cost.js (G37)', () => {
  it('G37: cost record has all required top-level fields', () => {
    const rec = buildCostRecord(BASE_ARGS);
    assert.equal(rec.schema_version, 1);
    assert.equal(rec.repo, 'owner/repo');
    assert.equal(rec.pr, 42);
    assert.ok(rec.head_sha);
    assert.ok(rec.run_id);
    assert.ok(rec.inputs);
    assert.ok(rec.output);
    assert.ok(rec.bob_usage);
    assert.ok(rec.duration_seconds);
    assert.ok(rec.compute);
    assert.equal(rec.outcome, 'reviewed');
  });

  it('G37: bob_usage.source is "reported"', () => {
    const rec = buildCostRecord(BASE_ARGS);
    assert.equal(rec.bob_usage.source, 'reported');
  });

  it('G37: bob_usage.total comes from stats.session_costs', () => {
    const rec = buildCostRecord(BASE_ARGS);
    assert.equal(rec.bob_usage.total, 0.118);
  });

  it('G37: bob_usage.unit is "bobcoins"', () => {
    const rec = buildCostRecord(BASE_ARGS);
    assert.equal(rec.bob_usage.unit, 'bobcoins');
  });

  it('G37: duration_seconds.total is derived from totalMs', () => {
    const rec = buildCostRecord(BASE_ARGS);
    assert.equal(rec.duration_seconds.total, 24.2);
  });

  it('G37: duration_seconds.bob is derived from stats.duration_ms', () => {
    const rec = buildCostRecord(BASE_ARGS);
    assert.equal(rec.duration_seconds.bob, 18.4);
  });

  it('G37: outcome is set correctly', () => {
    const rec = buildCostRecord({ ...BASE_ARGS, outcome: 'skipped_stale' });
    assert.equal(rec.outcome, 'skipped_stale');
  });

  it('G37: null stats produces null bob_usage.total', () => {
    const rec = buildCostRecord({ ...BASE_ARGS, stats: null });
    assert.equal(rec.bob_usage.total, null);
  });

  it('G37: inputs.files is set from inputs param', () => {
    const rec = buildCostRecord(BASE_ARGS);
    assert.equal(rec.inputs.files, 7);
    assert.equal(rec.inputs.diff_bytes, 18234);
    assert.equal(rec.inputs.prompt_bytes, 61234);
  });

  it('G37: output.findings_kept and findings_dropped are set', () => {
    const rec = buildCostRecord(BASE_ARGS);
    assert.equal(rec.output.findings_kept, 6);
    assert.equal(rec.output.findings_dropped, 2);
  });

  it('G37: run_id is CE_JOBRUN when set', () => {
    const orig = process.env.CE_JOBRUN;
    process.env.CE_JOBRUN = 'test-run-001';
    try {
      const rec = buildCostRecord(BASE_ARGS);
      assert.equal(rec.run_id, 'test-run-001');
    } finally {
      if (orig === undefined) delete process.env.CE_JOBRUN;
      else process.env.CE_JOBRUN = orig;
    }
  });
});
