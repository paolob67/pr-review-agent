// tests/unit/audit.test.js
// Unit tests for audit.js
// Guardrails covered: G20 (structured audit log), G27 (secrets never printed)

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerSecrets, scrub, logRunStart, logRunSummary, logBobFailure } from '../../reviewer/src/audit.js';

describe('audit.js - scrub (G27)', () => {
  it('G27: registered secret value is replaced with [SCRUBBED]', () => {
    const secretValue = 'super-secret-value-xyz123';
    registerSecrets([secretValue]);
    const result = scrub(`The token is ${secretValue} and more`);
    assert.ok(!result.includes(secretValue));
    assert.ok(result.includes('[SCRUBBED]'));
  });

  it('G27: canary secret value never appears in scrubbed output', () => {
    const canary = 'xxxxxxxxxcanaryxxxxxxxxx';
    registerSecrets([canary]);
    const text = `BOB_API_KEY=${canary} PATH=/usr/bin`;
    const result = scrub(text);
    assert.ok(!result.includes(canary), 'Canary must not appear after scrubbing');
    assert.ok(result.includes('[SCRUBBED]'));
  });

  it('G27: non-secret text is unchanged by scrub', () => {
    const text = 'This is normal text without secrets';
    const result = scrub(text);
    assert.equal(result, text);
  });

  it('G27: empty string passes through scrub', () => {
    assert.equal(scrub(''), '');
  });

  it('G27: multiple occurrences of secret are all scrubbed', () => {
    const s = 'abc123secretabc';
    registerSecrets([s]);
    const result = scrub(`${s} and ${s}`);
    assert.ok(!result.includes(s));
    const count = (result.match(/\[SCRUBBED\]/g) ?? []).length;
    assert.equal(count, 2);
  });
});

describe('audit.js - logRunSummary schema (G20)', () => {
  it('G20: logRunSummary writes a valid JSON line to stdout', () => {
    // Capture stdout temporarily.
    const written = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { written.push(chunk.toString()); return true; };
    try {
      logRunSummary('owner/repo', 42, 'a'.repeat(40), 'reviewed', { schema_version: 1 });
    } finally {
      process.stdout.write = origWrite;
    }
    assert.ok(written.length > 0, 'Should have written at least one line');
    const line = written[0].trim();
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(line); });
    assert.equal(parsed.event, 'run_summary');
    assert.equal(parsed.outcome, 'reviewed');
    assert.ok(parsed.ts, 'should have a timestamp');
    assert.ok(parsed.level, 'should have a level');
  });

  it('G27: logBobFailure scrubs secrets, strips control characters and caps the length', () => {
    const key = 'canary-bob-key-0123456789';
    registerSecrets([key]);
    const written = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { written.push(chunk.toString()); return true; };
    try {
      logBobFailure(`Error: bad key ${key}\n\u001b[31mred\u001b[0m ${'x'.repeat(1000)}`);
    } finally {
      process.stdout.write = origWrite;
    }
    const line = written[0].trim();
    assert.ok(!line.includes(key), 'secret must not reach the log');
    const parsed = JSON.parse(line);
    assert.equal(parsed.event, 'bob_failed');
    assert.ok(parsed.stderr_head.includes('[SCRUBBED]'));
    assert.ok(!/[\u0000-\u001f]/.test(parsed.stderr_head));
    assert.ok(parsed.stderr_head.length <= 300 + 9 * 2, 'capped near 300 characters');
  });

  it('G20: logRunStart writes event=run_start', () => {
    const written = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { written.push(chunk.toString()); return true; };
    try {
      logRunStart('owner/repo', 42, 'a'.repeat(40));
    } finally {
      process.stdout.write = origWrite;
    }
    const parsed = JSON.parse(written[0].trim());
    assert.equal(parsed.event, 'run_start');
  });
});
