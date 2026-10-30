// tests/unit/redact.test.js
// Unit tests for redact.js
// Guardrails covered: G15 (secret redaction)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactDiff } from '../../reviewer/src/redact.js';

describe('redact.js (G15)', () => {
  it('G15: GitHub token (ghp_) is redacted', () => {
    const diff = '+const token = "ghp_' + 'A'.repeat(36) + '";\n';
    const result = redactDiff(diff);
    assert.ok(!result.includes('ghp_'), 'GitHub token should be redacted');
    assert.ok(result.includes('[REDACTED]'), 'Should contain [REDACTED]');
  });

  it('G15: GitHub OAuth token (gho_) is redacted', () => {
    const diff = '+const tok = "gho_' + 'B'.repeat(36) + '";\n';
    const result = redactDiff(diff);
    assert.ok(!result.includes('gho_'));
    assert.ok(result.includes('[REDACTED]'));
  });

  it('G15: AWS access key ID (AKIA...) is redacted', () => {
    const diff = '+const key = "AKIAIOSFODNN7EXAMPLE";\n';
    const result = redactDiff(diff);
    assert.ok(!result.includes('AKIAIOSFODNN7EXAMPLE'));
    assert.ok(result.includes('[REDACTED]'));
  });

  it('G15: private key header is redacted', () => {
    const diff = '+const pem = "-----BEGIN RSA PRIVATE KEY-----";\n';
    const result = redactDiff(diff);
    assert.ok(!result.includes('BEGIN RSA PRIVATE KEY'));
    assert.ok(result.includes('[REDACTED]'));
  });

  it('G15: long string adjacent to api_key keyword is redacted', () => {
    const diff = '+const config = { api_key: "' + 'x'.repeat(36) + '" };\n';
    const result = redactDiff(diff);
    assert.ok(!result.includes('x'.repeat(36)));
    assert.ok(result.includes('[REDACTED]'));
  });

  it('G15: long string adjacent to token keyword is redacted', () => {
    const diff = '+const token: "' + 'y'.repeat(34) + '";\n';
    const result = redactDiff(diff);
    assert.ok(!result.includes('y'.repeat(34)));
    assert.ok(result.includes('[REDACTED]'));
  });

  it('G15: ordinary short variable values are NOT redacted', () => {
    const diff = '+const name = "Alice";\n';
    const result = redactDiff(diff);
    assert.equal(result, diff);
  });

  it('G15: ordinary code without credential keywords is NOT redacted', () => {
    const diff = '+function add(a, b) { return a + b; }\n';
    const result = redactDiff(diff);
    assert.equal(result, diff);
  });

  it('G15: diff structure (headers) is preserved', () => {
    const diff = '--- a/src/file.js\n+++ b/src/file.js\n@@ -1,1 +1,1 @@\n+const x = 1;\n';
    const result = redactDiff(diff);
    assert.ok(result.includes('+++ b/src/file.js'));
  });

  it('G15: non-string input is returned as-is', () => {
    assert.equal(redactDiff(null), null);
    assert.equal(redactDiff(undefined), undefined);
  });
});
