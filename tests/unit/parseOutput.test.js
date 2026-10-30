// tests/unit/parseOutput.test.js
// Unit tests for parseOutput.js
// Guardrails covered: G16 (output parsing)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseOutput, ParseError } from '../../reviewer/src/parseOutput.js';

const VALID_RESULT_LINE = JSON.stringify({
  type: 'result', timestamp: '2026-10-30T10:00:00.000Z', status: 'success',
  stats: { task_id: 'test', duration_ms: 1000, session_costs: 0.042, max_cost: 1.0, tool_calls: 0 },
  last_message: '{"schema_version":1,"summary":"ok","findings":[],"needs_human_attention":[]}',
});

describe('parseOutput.js (G16)', () => {
  it('G16: valid JSON line on stdout is parsed', () => {
    const { parsed, stats } = parseOutput(VALID_RESULT_LINE + '\n', 0, false);
    assert.equal(parsed.schema_version, 1);
    assert.equal(stats.session_costs, 0.042);
  });

  it('G16: extra text around result line is handled', () => {
    const stdout = 'Bob Shell v2.0.9\n' + VALID_RESULT_LINE + '\nDone.\n';
    const { parsed } = parseOutput(stdout, 0, false);
    assert.equal(parsed.schema_version, 1);
  });

  it('G16: nonzero exit code throws ParseError', () => {
    assert.throws(() => parseOutput('', 1, false), ParseError);
  });

  it('G16: timed out throws ParseError', () => {
    assert.throws(() => parseOutput('', 0, true), ParseError);
  });

  it('G16: bad JSON in last_message throws ParseError with bad_model_output', () => {
    const badResult = JSON.stringify({
      type: 'result', status: 'success',
      stats: { task_id: 't', duration_ms: 1, session_costs: 0, max_cost: 1.0, tool_calls: 0 },
      last_message: 'This is not JSON at all!',
    });
    let err;
    try { parseOutput(badResult, 0, false); } catch (e) { err = e; }
    assert.ok(err instanceof ParseError);
    assert.equal(err.outcome, 'bad_model_output');
  });

  it('G16: no result line in stdout throws ParseError', () => {
    assert.throws(() => parseOutput('just some random text\n', 0, false), ParseError);
  });

  it('G16: JSON surrounded by text in last_message is extracted', () => {
    const innerJson = '{"schema_version":1,"summary":"test","findings":[],"needs_human_attention":[]}';
    const resultLine = JSON.stringify({
      type: 'result', status: 'success',
      stats: { task_id: 't', duration_ms: 1, session_costs: 0.01, max_cost: 1.0, tool_calls: 0 },
      last_message: `Summary: The review is done.\n\n${innerJson}\n\nEnd of review.`,
    });
    const { parsed } = parseOutput(resultLine, 0, false);
    assert.equal(parsed.schema_version, 1);
    assert.equal(parsed.summary, 'test');
  });

  it('G16: timeout and nonzero exit map to bob_unavailable (CONTRACTS section 8)', () => {
    let e1, e2;
    try { parseOutput('', 0, true); } catch (e) { e1 = e; }
    try { parseOutput('', 1, false); } catch (e) { e2 = e; }
    assert.equal(e1.outcome, 'bob_unavailable');
    assert.equal(e2.outcome, 'bob_unavailable');
  });
});
