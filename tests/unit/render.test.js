// tests/unit/render.test.js
// Unit tests for render.js
// Guardrails covered: G18 (marker comment), G19 (footer), G35 (advisory header immutable)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderComment, renderUnavailableComment, parseMarker } from '../../reviewer/src/render.js';

const SHA = 'a'.repeat(40);
const COST_RECORD = {
  bob_usage: { source: 'reported', unit: 'usd', total: 0.042 },
  duration_seconds: { total: 10.0, bob: 8.0 },
};
const OUTPUT = {
  schema_version: 1,
  summary: 'Two findings.',
  findings: [
    {
      category: 'security', severity: 'high', confidence: 'high',
      rule_id: null, file: 'src/f.js', line: 1,
      title: 'SQL injection', evidence: 'db.query + id', explanation: 'Use params.', proposed_fix: null,
    },
  ],
  needs_human_attention: [],
};

describe('render.js (G18, G19, G35)', () => {
  it('G18: marker comment is the first line', () => {
    const comment = renderComment({ headSha: SHA, runs: 1, costRecord: COST_RECORD, output: OUTPUT, rulesStatus: {}, bobVersion: null, runId: 'r1' });
    const firstLine = comment.split('\n')[0];
    assert.ok(firstLine.startsWith('<!-- bob-pr-review:v1 '), `First line should be marker, got: ${firstLine}`);
  });

  it('G18: marker contains head sha', () => {
    const comment = renderComment({ headSha: SHA, runs: 1, costRecord: COST_RECORD, output: OUTPUT, rulesStatus: {}, bobVersion: null, runId: 'r1' });
    assert.ok(comment.includes(SHA));
  });

  it('G18: parseMarker round-trips correctly', () => {
    const comment = renderComment({ headSha: SHA, runs: 2, costRecord: COST_RECORD, output: OUTPUT, rulesStatus: {}, bobVersion: null, runId: 'r1' });
    const meta = parseMarker(comment);
    assert.ok(meta);
    assert.equal(meta.head, SHA);
    assert.equal(meta.runs, 2);
  });

  it('G35: advisory header is present and immutable', () => {
    const comment = renderComment({ headSha: SHA, runs: 1, costRecord: COST_RECORD, output: OUTPUT, rulesStatus: {}, bobVersion: null, runId: 'r1' });
    assert.ok(comment.includes('**AI Assisted review (advisory).**'));
    assert.ok(comment.includes('A human reviewer makes the final evaluation.'));
  });

  it('G19: footer is present and contains expected fields', () => {
    const comment = renderComment({ headSha: SHA, runs: 1, costRecord: COST_RECORD, output: OUTPUT, rulesStatus: { standards: true, teamRules: false }, bobVersion: '2.0.9', runId: 'run-001' });
    assert.ok(comment.includes('AI Assisted, advisory only'), 'Footer should say AI Assisted advisory only');
    assert.ok(comment.includes('run run-001'), 'Footer should include run ID');
    assert.ok(comment.includes('standards yes'), 'Footer should show standards status');
    assert.ok(comment.includes('team no'), 'Footer should show team rules status');
  });

  it('G18: no findings comment explicitly says so', () => {
    const emptyOutput = { ...OUTPUT, findings: [], summary: 'No issues.' };
    const comment = renderComment({ headSha: SHA, runs: 1, costRecord: COST_RECORD, output: emptyOutput, rulesStatus: {}, bobVersion: null, runId: 'r1' });
    assert.ok(comment.includes('_No findings in this review._'));
  });

  it('G35: renderUnavailableComment has marker and advisory header', () => {
    const comment = renderUnavailableComment({ headSha: SHA, runs: 1, costRecord: null, outcome: 'bob_unavailable', detail: 'timeout' });
    assert.ok(comment.split('\n')[0].startsWith('<!-- bob-pr-review:v1 '));
    assert.ok(comment.includes('**AI Assisted review (advisory).**'));
  });

  it('G35: short SHA is shown in footer (7 chars)', () => {
    const comment = renderComment({ headSha: SHA, runs: 1, costRecord: COST_RECORD, output: OUTPUT, rulesStatus: {}, bobVersion: null, runId: 'r1' });
    assert.ok(comment.includes(SHA.slice(0, 7)));
  });

  it('G14: marker cost_total is cumulative (prior spend plus this run)', () => {
    const comment = renderComment({ headSha: SHA, runs: 2, costRecord: COST_RECORD, output: OUTPUT, rulesStatus: {}, bobVersion: null, runId: 'r1', priorCostUsd: 0.1 });
    const meta = parseMarker(comment);
    assert.equal(meta.cost_total.usd, 0.142);
    assert.equal(meta.runs, 2);
  });

  it('G14: unavailable note keeps the cumulative spend in the marker', () => {
    const comment = renderUnavailableComment({ headSha: SHA, runs: 3, costRecord: null, outcome: 'bob_unavailable', detail: 'x', priorCostUsd: 0.25 });
    assert.equal(parseMarker(comment).cost_total.usd, 0.25);
  });
});
