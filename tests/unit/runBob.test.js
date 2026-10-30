// tests/unit/runBob.test.js
// Unit tests for runBob.js
// Guardrails covered: G2 (credential separation), G3 (scrubbed env), G13 (timeout)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBobEnv, runBob, getBobVersion, bobUserFromEnv } from '../../reviewer/src/runBob.js';
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

describe('runBob.js - bobUserFromEnv and Bob identity (S11, G23)', () => {
  it('G23: no identity when the image variables are unset (local runs)', () => {
    assert.equal(bobUserFromEnv({}), null);
  });

  it('G23: identity is read from the image variables', () => {
    const u = bobUserFromEnv({ REVIEW_BOB_UID: '10002', REVIEW_BOB_GID: '10003', REVIEW_BOB_HOME: '/home/x' });
    assert.deepEqual(u, { uid: 10002, gid: 10003, home: '/home/x' });
  });

  it('G23: uid 0 or malformed values are refused (never run Bob as root)', () => {
    assert.equal(bobUserFromEnv({ REVIEW_BOB_UID: '0', REVIEW_BOB_GID: '10002' }), null);
    assert.equal(bobUserFromEnv({ REVIEW_BOB_UID: '10002', REVIEW_BOB_GID: '0' }), null);
    assert.equal(bobUserFromEnv({ REVIEW_BOB_UID: 'abc', REVIEW_BOB_GID: '10002' }), null);
  });

  it('G23: Bob gets its own HOME, not the wrapper HOME', () => {
    const env = buildBobEnv({ PATH: '/bin', HOME: '/root', BOB_API_KEY: 'k' }, { uid: 10002, gid: 10002, home: '/home/bobrun' });
    assert.equal(env.HOME, '/home/bobrun');
    assert.equal(env.BOB_API_KEY, 'k');
  });
});

describe('runBob.js - runBob process (G13)', () => {
  it('G13: timeout kills hanging process and reports timedOut', async () => {
    const scratch = makeScratch();
    try {
      const result = await runBob({
        bobBin: FAKE_BOB,
        scratchDir: scratch,
        promptText: 'test',
        timeoutSeconds: 1,
        parentEnv: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'test',
          FAKE_BOB_SCENARIO: 'timeout', // fake-bob sleeps 30 seconds
        },
      });
      assert.equal(result.timedOut, true, 'must report the timeout');
      assert.equal(result.exitCode, null);
      assert.ok(result.durationMs < 10000, `process was not killed (took ${result.durationMs} ms)`);
    } finally {
      try { rmSync(scratch, { recursive: true, force: true }); } catch {}
    }
  }, { timeout: 15000 });

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

  it('G4 G30: every invocation passes the read-only flags, JSON output and the scratch workspace', async () => {
    const scratch = makeScratch();
    try {
      const result = await runBob({
        bobBin: FAKE_BOB,
        scratchDir: scratch,
        promptText: 'x',
        timeoutSeconds: 30,
        parentEnv: { PATH: process.env.PATH, HOME: process.env.HOME, FAKE_BOB_SCENARIO: 'valid', FAKE_BOB_PRINT_ENV: '1' },
      });
      const line = result.stderr.split('\n').find((l) => l.startsWith('FAKE_BOB_ARGV_DUMP:'));
      assert.ok(line, 'fake-bob must have dumped its argv');
      const argv = JSON.parse(line.slice('FAKE_BOB_ARGV_DUMP:'.length));
      const at = (flag) => argv[argv.indexOf(flag) + 1];
      assert.equal(argv[0], 'run');
      assert.equal(at('--disable-tool-groups'), 'edit,execute');
      assert.ok(argv.includes('--disable-mcp'));
      assert.equal(at('--workspace'), scratch);
      assert.equal(at('--mode'), 'reviewer');
      assert.equal(at('-f'), 'json');
      for (const banned of ['--yolo', '--trust', '--accept-license']) {
        assert.ok(!argv.includes(banned), `${banned} must never be passed`);
      }
    } finally {
      try { rmSync(scratch, { recursive: true, force: true }); } catch {}
    }
  }, { timeout: 15000 });

  it('G37: getBobVersion returns the first line of `bob --version`', async () => {
    const v = await getBobVersion({ bobBin: FAKE_BOB, parentEnv: { PATH: process.env.PATH, FAKE_BOB_VERSION: '9.8.7' } });
    assert.equal(v, '9.8.7');
  }, { timeout: 15000 });

  it('G37: getBobVersion returns null when the binary is missing', async () => {
    const v = await getBobVersion({ bobBin: '/nonexistent/bob', parentEnv: { PATH: process.env.PATH } });
    assert.equal(v, null);
  });

  it('G37: getBobVersion returns null for unparseable output', async () => {
    const v = await getBobVersion({ bobBin: FAKE_BOB, parentEnv: { PATH: process.env.PATH, FAKE_BOB_VERSION: 'not a version!' } });
    assert.equal(v, null);
  }, { timeout: 15000 });
});
