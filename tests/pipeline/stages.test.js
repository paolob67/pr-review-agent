// tests/pipeline/stages.test.js
// Staged mode: prepare, review and publish run as three separate processes of the real CLI
// (reviewer/bin/reviewer.js), each with only its own credential, exchanging files. This mirrors the
// three GitHub Actions jobs (ADR 0012, ADR 0013).
// Guardrails covered: G2, G23, G25 (credential separation by stage), G16 and G36 (the result is
// untrusted input to publish), G24 (stage inputs), G34 (comment endpoints only).
//
// Offline: fake-bob and the mock GitHub server, no network.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { start, stop, world } from '../fixtures/mock-server.js';
import { validateResult } from '../../reviewer/src/stages.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '..', '..', 'reviewer', 'bin', 'reviewer.js');
const FAKE_BOB = join(here, '..', 'fixtures', 'fake-bob.js');
const SAMPLE_DIFF = readFileSync(join(here, '..', 'fixtures', 'sample.diff'), 'utf8');
const PORT = 3998;
const SHA40 = 'a'.repeat(40);
const RULES = {
  '.bob-review/standards.md': '# Standards\n## STD-001: No hardcoded secrets\n## STD-002: Parameterised queries\n',
  '.bob-review/project-rules.md': '# Team\n## TEAM-001: Example rule\n',
};

const READ = 'stage-read-token-canary';
const COMMENT = 'stage-comment-token-canary';
const BOB = 'stage-bob-key-canary';

let dir;
before(async () => { await start(PORT); });
after(async () => { await stop(); });
beforeEach(() => {
  world.reset(); world.setDiff(SAMPLE_DIFF); world.setRules(RULES);
  dir = mkdtempSync(join(tmpdir(), 'stages-test-'));
});

// Common, non-secret environment (what the workflow `env:` provides to every job).
function baseEnv(extra = {}) {
  return {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test',
    REVIEW_REPO: 'owner/repo', REVIEW_PR_NUMBER: '1', REVIEW_HEAD_SHA: SHA40,
    REVIEW_API_BASE: `http://127.0.0.1:${PORT}`, REVIEW_BOB_BIN: FAKE_BOB,
    REVIEW_BOB_TIMEOUT_SECONDS: '30', REVIEW_EXCHANGE_DIR: dir, FAKE_BOB_SCENARIO: 'valid',
    ...extra,
  };
}

// Each stage gets exactly one credential, as in the workflow.
const stageEnv = {
  prepare: (x) => baseEnv({ SCM_READ_TOKEN: READ, ...x }),
  review:  (x) => baseEnv({ BOB_API_KEY: BOB, ...x }),
  publish: (x) => baseEnv({ SCM_COMMENT_TOKEN: COMMENT, ...x }),
};

function runStage(stage, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, stage], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', c => { out += c; });
    child.stderr.on('data', c => { err += c; });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

const summaryOf = (out) => out.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)).find(l => l.event === 'run_summary');
const posted = () => world.capturedRequests().filter(r => (r.method === 'POST' || r.method === 'PATCH') && r.pathname.includes('/comments'));
const authOf = (r) => r.headers['authorization'] ?? '';

async function runAll(overrides = {}) {
  const prep = await runStage('prepare', stageEnv.prepare(overrides.prepare));
  const rev = await runStage('review', stageEnv.review(overrides.review));
  const pub = await runStage('publish', stageEnv.publish(overrides.publish));
  return { prep, rev, pub };
}

describe('staged mode (three processes, one credential each)', () => {
  it('G2 G23 G25: prepare, review and publish each use only their own credential and one comment is posted', async () => {
    const { prep, rev, pub } = await runAll();
    assert.equal(prep.code, 0); assert.equal(rev.code, 0); assert.equal(pub.code, 0);
    assert.equal(summaryOf(pub.out)?.outcome, 'reviewed');

    // Prepare wrote the handoff and never posted; publish posted with the comment token only.
    assert.ok(existsSync(join(dir, 'handoff.json')));
    assert.ok(existsSync(join(dir, 'result.json')));
    const reqs = world.capturedRequests();
    for (const r of reqs) {
      if (r.method === 'POST' || r.method === 'PATCH') assert.ok(authOf(r).includes(COMMENT), 'writes use the comment token');
      else assert.ok(authOf(r).includes(READ) || authOf(r).includes(COMMENT), 'reads use the read token (or the comment token for listing)');
    }
    assert.equal(posted().length, 1);
    assert.ok(!reqs.some(r => authOf(r).includes(BOB)), 'the Bob key is never sent to GitHub');
  });

  it('G2 G23: no credential of another stage appears in the exchange files or in any stage output', async () => {
    const { prep, rev, pub } = await runAll();
    const files = ['handoff.json', 'result.json', 'audit.json'].map(f => readFileSync(join(dir, f), 'utf8')).join('\n');
    const everything = files + prep.out + prep.err + rev.out + rev.err + pub.out + pub.err;
    for (const secret of [READ, COMMENT, BOB]) assert.ok(!everything.includes(secret), `secret ${secret} leaked`);
  });

  it('G25: the review stage has no GitHub token and makes no GitHub request', async () => {
    await runStage('prepare', stageEnv.prepare());
    const before = world.capturedRequests().length;
    const rev = await runStage('review', stageEnv.review());
    assert.equal(rev.code, 0);
    assert.equal(world.capturedRequests().length, before, 'review must not call GitHub');
  });

  it('G16 G36: publish treats result.json as untrusted: off-shape content is rejected, one note is posted', async () => {
    await runStage('prepare', stageEnv.prepare());
    writeFileSync(join(dir, 'result.json'), JSON.stringify({ stdout: 42, exitCode: 'zero', timedOut: 'no' }));
    const pub = await runStage('publish', stageEnv.publish());
    assert.equal(pub.code, 0);
    assert.equal(summaryOf(pub.out)?.outcome, 'bad_model_output');
    const body = JSON.parse(posted()[0].body).body;
    assert.ok(body.includes('AI Assisted'), 'header intact');
  });

  it('G16: publish with a missing result posts the unavailable note, not a review', async () => {
    await runStage('prepare', stageEnv.prepare());
    const pub = await runStage('publish', stageEnv.publish());
    assert.equal(summaryOf(pub.out)?.outcome, 'bob_unavailable');
    assert.equal(posted().length, 1);
  });

  it('G24: a handoff for different inputs is not used by review or publish', async () => {
    await runStage('prepare', stageEnv.prepare());
    const other = { REVIEW_PR_NUMBER: '2' };
    const rev = await runStage('review', stageEnv.review(other));
    assert.equal(summaryOf(rev.out)?.outcome, 'rejected_input');
    assert.ok(!existsSync(join(dir, 'result.json')), 'no review was run');
    const pub = await runStage('publish', stageEnv.publish(other));
    assert.equal(summaryOf(pub.out)?.outcome, 'rejected_input');
    assert.equal(posted().length, 0);
  });

  it('G24: invalid inputs are rejected in every stage before any API call', async () => {
    for (const stage of ['prepare', 'review', 'publish']) {
      const r = await runStage(stage, stageEnv[stage]({ REVIEW_HEAD_SHA: 'nope; rm -rf /' }));
      assert.equal(summaryOf(r.out)?.outcome, 'rejected_input', stage);
    }
    assert.equal(world.capturedRequests().length, 0);
  });

  it('gate: a stale head ends in prepare, review does nothing and publish posts nothing', async () => {
    const prep = await runStage('prepare', stageEnv.prepare({ REVIEW_HEAD_SHA: 'b'.repeat(40) }));
    assert.equal(summaryOf(prep.out)?.outcome, 'skipped_stale');
    const rev = await runStage('review', stageEnv.review({ REVIEW_HEAD_SHA: 'b'.repeat(40) }));
    assert.equal(rev.code, 0);
    assert.ok(!existsSync(join(dir, 'result.json')));
    const pub = await runStage('publish', stageEnv.publish({ REVIEW_HEAD_SHA: 'b'.repeat(40) }));
    assert.equal(summaryOf(pub.out)?.outcome, 'skipped_stale');
    assert.equal(posted().length, 0);
  });

  it('size gate: prepare asks publish for a short note, and publish posts it', async () => {
    const prep = await runStage('prepare', stageEnv.prepare({ REVIEW_MAX_FILES: '0' }));
    assert.equal(summaryOf(prep.out)?.outcome, 'skipped_gate');
    assert.equal(posted().length, 0, 'prepare never posts');
    const pub = await runStage('publish', stageEnv.publish());
    assert.equal(summaryOf(pub.out)?.outcome, 'skipped_gate');
    assert.equal(posted().length, 1);
  });

  it('kill switch (G10): a stage exits quietly without touching the exchange directory', async () => {
    const r = await runStage('prepare', stageEnv.prepare({ REVIEW_ENABLED: 'false' }));
    assert.equal(r.code, 0);
    assert.ok(!existsSync(join(dir, 'handoff.json')));
    assert.equal(world.capturedRequests().length, 0);
  });

  it('CLI: an unknown stage or extra argument is refused', async () => {
    for (const args of [['wipe'], ['prepare', 'extra']]) {
      const r = await new Promise((resolve) => {
        const c = spawn(process.execPath, [CLI, ...args], { env: baseEnv(), stdio: 'ignore' });
        c.on('close', (code) => resolve(code));
      });
      assert.equal(r, 1);
    }
  });
});

describe('validateResult (the result artifact is untrusted)', () => {
  const good = { stdout: '{}', exitCode: 0, timedOut: false, durationMs: 10, stageMs: 20, bobVersion: '2.0.9', imageDigest: null, spawnError: null };
  it('accepts a well-formed result', () => assert.ok(validateResult(good).result));
  it('rejects non-objects and arrays', () => {
    for (const v of [null, 'x', 3, []]) assert.ok(validateResult(v).error);
  });
  it('rejects wrong types and malformed identifiers', () => {
    for (const patch of [{ stdout: 1 }, { exitCode: '0' }, { timedOut: 'false' }, { durationMs: -1 }, { stageMs: NaN },
      { bobVersion: '2.0.9; rm -rf /' }, { imageDigest: 'sha256:short' }, { spawnError: 5 }]) {
      assert.ok(validateResult({ ...good, ...patch }).error, JSON.stringify(patch));
    }
  });
  it('rejects an oversized stdout', () => {
    assert.ok(validateResult({ ...good, stdout: 'x'.repeat(2 * 1024 * 1024 + 1) }).error);
  });
  it('drops unknown fields', () => {
    const r = validateResult({ ...good, extra: 'x' }).result;
    assert.equal(r.extra, undefined);
  });
});
