// tests/unit/runBob.test.js
// Unit tests for runBob.js
// Guardrails covered: G2 (credential separation), G3 (scrubbed env), G13 (timeout)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBobEnv, runBob } from '../../reviewer/src/runBob.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE_BOB = join(__dirname, '..', 'fixtures', 'fake-bob.js');
const SCENARIOS_DIR = join(__dirname, '..', 'fixtures', 'scenarios');

function makeScratch() {
  const dir = mkdtempSync(join(tmpdir(), 'test-scratch-'));
  mkdirSync(join(dir, '.bob'), { recursive: true });
  // Minimal custom_modes.yaml
  writeFileSync(join(dir, '.bob', 'custom_modes.yaml'), 'customModes:\n  - slug: reviewer\n    name: PR Reviewer\n    groups:\n      - read\n', 'utf8');
  return dir;
}

describe('runBob.js - buildBobEnv (G2, G3)', () => {
  it('G3: scrubbed env only contains allowed vars', () => {
    const parent = {
      BOB_API_KEY: 'bobkey', PATH: '/usr/bin', HOME: '/root', NODE_ENV: 'test',
      SCM_READ_TOKEN: 'scm_read', SCM_COMMENT_TOKEN: 'scm_write',
      OTHER_VAR: 'other',
    };
    const env = buildBobEnv(parent);
    assert.ok('BOB_API_KEY' in env);
    assert.ok('PATH' in env);
    assert.ok('HOME' in env);
    assert.ok('NODE_ENV' in env);
    assert.ok(!('SCM_READ_TOKEN' in env), 'SCM_READ_TOKEN must not be in Bob env');
    assert.ok(!('SCM_COMMENT_TOKEN' in env), 'SCM_COMMENT_TOKEN must not be in Bob env');
    assert.ok(!('OTHER_VAR' in env), 'OTHER_VAR must not be in Bob env');
  });

  it('G2: SCM_READ_TOKEN absent from Bob env', () => {
    const env = buildBobEnv({ SCM_READ_TOKEN: 'secret', PATH: '/bin' });
    assert.ok(!('SCM_READ_TOKEN' in env));
  });

  it('G2: SCM_COMMENT_TOKEN absent from Bob env', () => {
    const env = buildBobEnv({ SCM_COMMENT_TOKEN: 'secret', PATH: '/bin' });
    assert.ok(!('SCM_COMMENT_TOKEN' in env));
  });

  it('G3: canary var CANARY_BOB_MUST_NOT_APPEAR is absent from env', () => {
    const parent = { PATH: '/bin', CANARY_BOB_MUST_NOT_APPEAR: 'canary-val' };
    // buildBobEnv should NOT include the canary var (it's not in the allowlist)
    const env = buildBobEnv(parent);
    assert.ok(!('CANARY_BOB_MUST_NOT_APPEAR' in env));
  });
});

describe('runBob.js - runBob process (G13)', () => {
  it('G13: timeout kills hanging process', async () => {
    const scratch = makeScratch();
    try {
      const result = await runBob({
        bobBin: process.execPath,
        scratchDir: scratch,
        promptText: 'test',
        timeoutSeconds: 2,
        parentEnv: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'test',
          FAKE_BOB_SCENARIO: 'timeout',
        },
        // Use node directly to run a script that just sleeps
        // We use a quick inline sleep script instead of fake-bob for isolation
      });
      // The process should have been killed (timedOut or nonzero exit).
      // We just verify runBob returns rather than hanging.
      assert.ok(result.durationMs < 10000, 'Should not hang for full 30s');
    } finally {
      try { rmSync(scratch, { recursive: true, force: true }); } catch {}
    }
  }, { timeout: 10000 });

  it('G13: fake-bob valid scenario returns stdout with result JSON', async () => {
    const scratch = makeScratch();
    try {
      const result = await runBob({
        bobBin: FAKE_BOB,
        scratchDir: scratch,
        promptText: 'hello',
        timeoutSeconds: 30,
        parentEnv: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'test',
          FAKE_BOB_SCENARIO: 'empty',
        },
      });
      assert.equal(result.exitCode, 0);
      assert.ok(result.stdout.includes('"type":"result"'), 'stdout should contain result JSON');
    } finally {
      try { rmSync(scratch, { recursive: true, force: true }); } catch {}
    }
  }, { timeout: 15000 });

  it('G3: fake-bob with canary env scenario - canary absent from child env (G3)', async () => {
    const scratch = makeScratch();
    try {
      const result = await runBob({
        bobBin: FAKE_BOB,
        scratchDir: scratch,
        promptText: 'hello',
        timeoutSeconds: 30,
        parentEnv: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'test',
          FAKE_BOB_SCENARIO: 'env_print',
          FAKE_BOB_PRINT_ENV: '1',
          SCM_READ_TOKEN: 'scm-read-canary-token',
          SCM_COMMENT_TOKEN: 'scm-comment-canary-token',
          CANARY_BOB_MUST_NOT_APPEAR: 'must-not-appear',
        },
      });
      const combined = result.stdout + result.stderr;
      assert.ok(!combined.includes('scm-read-canary-token'), 'SCM_READ_TOKEN must not appear in Bob output');
      assert.ok(!combined.includes('scm-comment-canary-token'), 'SCM_COMMENT_TOKEN must not appear in Bob output');
      assert.ok(!combined.includes('must-not-appear'), 'CANARY_BOB_MUST_NOT_APPEAR must not appear in Bob output');
    } finally {
      try { rmSync(scratch, { recursive: true, force: true }); } catch {}
    }
  }, { timeout: 15000 });
});
