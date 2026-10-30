// tests/unit/validate.test.js
// Unit tests for validate.js
// Guardrails covered: G16 (schema validation), G36 (findings contract)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFindings, ValidationError, parseDiffChangedLines } from '../../reviewer/src/validate.js';

// A minimal valid diff that adds lines in src/utils.js
const SAMPLE_DIFF = `diff --git a/src/utils.js b/src/utils.js
index abc..def 100644
--- a/src/utils.js
+++ b/src/utils.js
@@ -1,2 +1,4 @@
+const x = 1;
+const y = 2;
 unchanged
+const z = 3;
`;

const RULE_IDS = new Set(['STD-001', 'STD-002', 'TEAM-001']);

function makeValidParsed(overrides = {}) {
  return {
    schema_version: 1,
    summary: 'A summary.',
    findings: [{
      category: 'security', severity: 'high', confidence: 'high',
      rule_id: null, file: 'src/utils.js', line: 1,
      title: 'A finding', evidence: 'code', explanation: 'why', proposed_fix: null,
    }],
    needs_human_attention: [],
    ...overrides,
  };
}

describe('validate.js - parseDiffChangedLines', () => {
  it('extracts changed line numbers from diff', () => {
    const map = parseDiffChangedLines(SAMPLE_DIFF);
    assert.ok(map.has('src/utils.js'));
    const lines = map.get('src/utils.js');
    // Added lines are at positions 1, 2, 4 (the +const lines)
    assert.ok(lines.has(1));
    assert.ok(lines.has(2));
    assert.ok(lines.has(4));
    // Context line 3 is not added
    assert.ok(!lines.has(3));
  });
});

describe('validate.js - validateFindings (G16, G36)', () => {
  it('G16: valid schema version 1 passes', () => {
    const { valid, dropped } = validateFindings(makeValidParsed(), SAMPLE_DIFF, RULE_IDS);
    assert.equal(dropped, 0);
    assert.equal(valid.schema_version, 1);
  });

  it('G16: schema_version != 1 throws ValidationError', () => {
    const parsed = makeValidParsed({ schema_version: 2 });
    assert.throws(() => validateFindings(parsed, SAMPLE_DIFF, RULE_IDS), ValidationError);
  });

  it('G16: null parsed throws ValidationError', () => {
    assert.throws(() => validateFindings(null, SAMPLE_DIFF, RULE_IDS), ValidationError);
  });

  it('G36: invalid category is dropped (mixed with valid finding)', () => {
    const parsed = makeValidParsed({ findings: [
      {
        category: 'UNKNOWN', severity: 'high', confidence: 'high',
        rule_id: null, file: 'src/utils.js', line: 1,
        title: 'invalid', evidence: 'x', explanation: 'x', proposed_fix: null,
      },
      {
        category: 'security', severity: 'high', confidence: 'high',
        rule_id: null, file: 'src/utils.js', line: 2,
        title: 'valid', evidence: 'x', explanation: 'x', proposed_fix: null,
      },
    ]});
    const { dropped, valid } = validateFindings(parsed, SAMPLE_DIFF, RULE_IDS);
    assert.equal(dropped, 1);
    assert.equal(valid.findings.length, 1);
  });

  it('G36: single invalid category finding - all invalid - throws bad_model_output', () => {
    const parsed = makeValidParsed({ findings: [{
      category: 'UNKNOWN', severity: 'high', confidence: 'high',
      rule_id: null, file: 'src/utils.js', line: 1,
      title: 'x', evidence: 'x', explanation: 'x', proposed_fix: null,
    }]});
    assert.throws(() => validateFindings(parsed, SAMPLE_DIFF, RULE_IDS), (err) => {
      return err.outcome === 'bad_model_output';
    });
  });

  it('G36: low confidence finding moves to needs_human_attention', () => {
    const parsed = makeValidParsed({ findings: [{
      category: 'security', severity: 'low', confidence: 'low',
      rule_id: null, file: 'src/utils.js', line: 1,
      title: 'Low conf', evidence: '', explanation: 'unsure', proposed_fix: null,
    }]});
    const { valid, movedToAttention } = validateFindings(parsed, SAMPLE_DIFF, RULE_IDS);
    assert.equal(movedToAttention, 1);
    assert.equal(valid.findings.length, 0);
    assert.ok(valid.needs_human_attention.length > 0);
  });

  it('G36: hallucinated file is dropped (mixed with valid finding)', () => {
    const parsed = makeValidParsed({ findings: [
      {
        category: 'security', severity: 'high', confidence: 'high',
        rule_id: null, file: 'does_not_exist.ts', line: 9999,
        title: 'hallucinated', evidence: '', explanation: '', proposed_fix: null,
      },
      {
        category: 'security', severity: 'high', confidence: 'high',
        rule_id: null, file: 'src/utils.js', line: 1,
        title: 'valid', evidence: '', explanation: '', proposed_fix: null,
      },
    ]});
    const { dropped } = validateFindings(parsed, SAMPLE_DIFF, RULE_IDS);
    assert.equal(dropped, 1);
  });

  it('G36: hallucinated line (not in diff) is dropped (mixed with valid finding)', () => {
    const parsed = makeValidParsed({ findings: [
      {
        category: 'security', severity: 'high', confidence: 'high',
        rule_id: null, file: 'src/utils.js', line: 9999,
        title: 'wrong line', evidence: '', explanation: '', proposed_fix: null,
      },
      {
        category: 'security', severity: 'medium', confidence: 'high',
        rule_id: null, file: 'src/utils.js', line: 2,
        title: 'valid', evidence: '', explanation: '', proposed_fix: null,
      },
    ]});
    const { dropped } = validateFindings(parsed, SAMPLE_DIFF, RULE_IDS);
    assert.equal(dropped, 1);
  });

  it('G36: unknown rule_id for standards finding is dropped (when ruleIds populated)', () => {
    const parsed = makeValidParsed({ findings: [
      {
        category: 'standards', severity: 'medium', confidence: 'high',
        rule_id: 'STD-FAKE-999', file: 'src/utils.js', line: 1,
        title: 'fake rule', evidence: '', explanation: '', proposed_fix: null,
      },
      {
        category: 'security', severity: 'high', confidence: 'high',
        rule_id: null, file: 'src/utils.js', line: 2,
        title: 'valid', evidence: '', explanation: '', proposed_fix: null,
      },
    ]});
    const { dropped } = validateFindings(parsed, SAMPLE_DIFF, RULE_IDS);
    assert.equal(dropped, 1);
  });

  it('G36: known rule_id for standards finding passes', () => {
    const parsed = makeValidParsed({ findings: [{
      category: 'standards', severity: 'medium', confidence: 'high',
      rule_id: 'STD-001', file: 'src/utils.js', line: 1,
      title: 'x', evidence: '', explanation: '', proposed_fix: null,
    }]});
    const { dropped } = validateFindings(parsed, SAMPLE_DIFF, RULE_IDS);
    assert.equal(dropped, 0);
  });

  it('G36: all-invalid findings throws bad_model_output', () => {
    const parsed = makeValidParsed({ findings: [{
      category: 'security', severity: 'high', confidence: 'high',
      rule_id: null, file: 'does_not_exist.ts', line: 9999,
      title: 'x', evidence: '', explanation: '', proposed_fix: null,
    }]});
    let err;
    try {
      validateFindings(parsed, SAMPLE_DIFF, RULE_IDS);
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof ValidationError);
    assert.equal(err.outcome, 'bad_model_output');
  });

  it('G36: empty findings array is valid (not an error)', () => {
    const parsed = makeValidParsed({ findings: [] });
    const { valid } = validateFindings(parsed, SAMPLE_DIFF, RULE_IDS);
    assert.equal(valid.findings.length, 0);
  });

  it('G36: standards finding is dropped when no rules were loaded (empty rule set)', () => {
    const parsed = makeValidParsed({ findings: [
      {
        category: 'standards', severity: 'medium', confidence: 'high',
        rule_id: 'STD-001', file: 'src/utils.js', line: 1,
        title: 'cites a rule that was not supplied', evidence: '', explanation: '', proposed_fix: null,
      },
      {
        category: 'security', severity: 'high', confidence: 'high',
        rule_id: null, file: 'src/utils.js', line: 2,
        title: 'valid', evidence: '', explanation: '', proposed_fix: null,
      },
    ]});
    const { dropped, valid } = validateFindings(parsed, SAMPLE_DIFF, new Set());
    assert.equal(dropped, 1);
    assert.equal(valid.findings.length, 1);
  });
});
