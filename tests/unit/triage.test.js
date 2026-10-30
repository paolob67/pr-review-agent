// tests/unit/triage.test.js
// Unit tests for triage.js
// Guardrails covered: G36 (de-duplication, per-category cap, total cap, severity ordering)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { triageFindings } from '../../reviewer/src/triage.js';

function makeF(overrides) {
  return {
    category: 'security', severity: 'high', confidence: 'high',
    rule_id: null, file: 'src/f.js', line: 1,
    title: 'T', evidence: '', explanation: '', proposed_fix: null,
    ...overrides,
  };
}

describe('triage.js (G36)', () => {
  it('G36: duplicates on (file, line, title) are de-duplicated', () => {
    const findings = [
      makeF({ file: 'a.js', line: 1, title: 'Dup' }),
      makeF({ file: 'a.js', line: 1, title: 'Dup' }),
      makeF({ file: 'a.js', line: 1, title: 'Dup' }),
    ];
    const result = triageFindings(findings, 5, 15);
    assert.equal(result.length, 1);
  });

  it('G36: duplicates with rule_id are de-duplicated on rule_id', () => {
    const findings = [
      makeF({ file: 'a.js', line: 1, rule_id: 'STD-001', title: 'T1' }),
      makeF({ file: 'a.js', line: 1, rule_id: 'STD-001', title: 'T2' }),
    ];
    const result = triageFindings(findings, 5, 15);
    assert.equal(result.length, 1);
  });

  it('G36: per-category cap is applied', () => {
    const findings = [];
    for (let i = 0; i < 8; i++) {
      findings.push(makeF({ file: 'a.js', line: i + 1, title: `Security ${i}` }));
    }
    const result = triageFindings(findings, 5, 15);
    const secCount = result.filter(f => f.category === 'security').length;
    assert.ok(secCount <= 5);
  });

  it('G36: total cap is applied', () => {
    const findings = [];
    for (let i = 0; i < 10; i++) {
      findings.push(makeF({ category: 'security', file: 'a.js', line: i + 1, title: `S${i}` }));
      findings.push(makeF({ category: 'other', file: 'b.js', line: i + 1, title: `O${i}` }));
    }
    const result = triageFindings(findings, 5, 8);
    assert.ok(result.length <= 8);
  });

  it('G36: severity ordering - critical before high before medium', () => {
    const findings = [
      makeF({ severity: 'medium', file: 'a.js', line: 1, title: 'Med' }),
      makeF({ severity: 'critical', file: 'b.js', line: 2, title: 'Crit' }),
      makeF({ severity: 'high', file: 'c.js', line: 3, title: 'High' }),
    ];
    const result = triageFindings(findings, 5, 15);
    assert.equal(result[0].severity, 'critical');
    assert.equal(result[1].severity, 'high');
    assert.equal(result[2].severity, 'medium');
  });

  it('G36: empty findings returns empty array', () => {
    assert.deepEqual(triageFindings([], 5, 15), []);
  });

  it('G36: within limits all findings are kept', () => {
    const findings = [
      makeF({ file: 'a.js', line: 1, title: 'A' }),
      makeF({ category: 'standards', file: 'b.js', line: 2, title: 'B', rule_id: 'STD-001' }),
    ];
    const result = triageFindings(findings, 5, 15);
    assert.equal(result.length, 2);
  });
});
