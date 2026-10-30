// tests/pipeline/pipeline.test.js
// End-to-end pipeline tests using fake-bob and mock GitHub server.
// Guardrails covered: G2, G3, G7, G8, G9, G13, G14, G15, G16, G17, G18, G19, G20,
//                     G24, G27, G28, G32, G33, G34, G35, G36, G37
//
// All tests are offline: no real Bob, no real GitHub, no real IBM Cloud.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../reviewer/src/main.js';
import { start, stop, world } from '../fixtures/mock-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE_BOB   = join(__dirname, '..', 'fixtures', 'fake-bob.js');
const SAMPLE_DIFF = readFileSync(join(__dirname, '..', 'fixtures', 'sample.diff'), 'utf8');

const PORT = 3999;
const API_BASE = `http://127.0.0.1:${PORT}`;
const SHA40 = 'a'.repeat(40);
const SHA40B = 'b'.repeat(40);

// Base env shared by all pipeline tests.
function makeEnv(overrides = {}) {
  return {
    REVIEW_REPO: 'owner/repo',
    REVIEW_PR_NUMBER: '1',
    REVIEW_HEAD_SHA: SHA40,
    REVIEW_API_BASE: API_BASE,
    REVIEW_BOB_BIN: FAKE_BOB,
    REVIEW_BOB_TIMEOUT_SECONDS: '30',
    SCM_READ_TOKEN: 'fake-read-token',
    SCM_COMMENT_TOKEN: 'fake-comment-token',
    BOB_API_KEY: 'fake-bob-key',
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'test',
    FAKE_BOB_SCENARIO: 'valid',
    ...overrides,
  };
}

// Capture stdout lines by temporarily wrapping process.stdout.write.
// We keep a reference to the original function and always restore it.
function captureStdout() {
  const lines = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  let restored = false;
  process.stdout.write = function(chunk, encoding, callback) {
    lines.push(chunk.toString());
    // Forward to the original to avoid breaking node:test reporter.
    return origWrite(chunk, encoding, callback);
  };
  const restore = () => {
    if (!restored) {
      restored = true;
      process.stdout.write = origWrite;
    }
  };
  return { lines, restore };
}

before(async () => { await start(PORT); });
after(async ()  => { await stop(); });
const RULES = {
  '.bob-review/standards.md': '# Standards\n## STD-001: No hardcoded secrets\n## STD-002: Parameterised queries\n',
  '.bob-review/project-rules.md': '# Team\n## TEAM-001: Example rule\n',
};
beforeEach(() => { world.reset(); world.setDiff(SAMPLE_DIFF); world.setRules(RULES); });

// ------------------------------------------------------------------
// Helper: run main() and collect exit code, comments, and audit log.
// main() calls process.exit() which we intercept by wrapping it.
// ------------------------------------------------------------------
async function runPipeline(envOverrides = {}) {
  const env = makeEnv(envOverrides);
  // Note: world.reset() in beforeEach already sets default PR with head.sha = SHA40.
  // Tests that need different PR state (draft, closed, etc.) must call world.setPR() before runPipeline.
  // For tests that use a non-standard REVIEW_HEAD_SHA, update just the head sha.
  // We do NOT unconditionally call world.setPR() here to preserve test-specific PR state.

  let exitCode = 0;
  const origExit = process.exit;

  // Replace process.exit with a function that records the exit code and throws
  // a sentinel error so main() stops executing. We handle it in the catch below.
  const exitSentinel = Symbol('exitSentinel');
  process.exit = (code) => {
    exitCode = code ?? 0;
    // Use a specially-typed Error so unhandled-rejection handlers don't catch it.
    const err = new Error('process.exit intercepted');
    err[exitSentinel] = true;
    err.code = code;
    throw err;
  };

  const { lines, restore } = captureStdout();
  try {
    await main(env);
  } catch (e) {
    if (!e?.[exitSentinel]) {
      restore();
      process.exit = origExit;
      throw e;
    }
    // Normal exit: record the code and continue.
    exitCode = e.code ?? 0;
  } finally {
    restore();
    process.exit = origExit;
  }

  return {
    exitCode,
    auditLines: lines.filter(l => l.trim().startsWith('{')).map(l => {
      try { return JSON.parse(l.trim()); } catch { return null; }
    }).filter(Boolean),
    comments: world.capturedRequests().filter(r => r.method === 'POST' || r.method === 'PATCH'),
    allRequests: world.capturedRequests(),
    commentBodies: world.capturedRequests()
      .filter(r => r.method === 'POST' && r.pathname.includes('/comments'))
      .map(r => { try { return JSON.parse(r.body).body; } catch { return ''; } }),
    patchBodies: world.capturedRequests()
      .filter(r => r.method === 'PATCH' && r.pathname.includes('/comments/'))
      .map(r => { try { return JSON.parse(r.body).body; } catch { return ''; } }),
  };
}

// ------------------------------------------------------------------
describe('pipeline.test.js', () => {

  // outcome:reviewed - happy path
  it('outcome:reviewed - valid scenario posts comment with advisory header and marker', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.exitCode, 0);

    const allCommentBodies = [...result.commentBodies, ...result.patchBodies];
    assert.ok(allCommentBodies.length > 0, 'Should have posted a comment');
    const body = allCommentBodies[0];
    assert.ok(body.startsWith('<!-- bob-pr-review:v1 '), 'Comment should start with marker');
    assert.ok(body.includes('**AI Assisted review (advisory).**'), 'Should have advisory header');
    assert.ok(body.includes('AI Assisted, advisory only'), 'Footer should say advisory only');

    // Verify run_summary audit event
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.ok(summary, 'Should have run_summary audit event');
    assert.equal(summary.outcome, 'reviewed');
  });

  // outcome:reviewed idempotent - second run uses PATCH not POST
  it('outcome:reviewed idempotent - second run updates existing comment via PATCH', async () => {
    // Set up an existing marker comment.
    const existingMarker = '<!-- bob-pr-review:v1 {"head":"' + SHA40 + '","runs":1,"cost_total":{"bobcoins":0.042}} -->\n> **AI Assisted review (advisory).** Generated by IBM Bob.\n';
    world.setComments([{ id: 999, body: existingMarker }]);

    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.exitCode, 0);

    // Should have used PATCH not POST for the comment.
    const patches = result.allRequests.filter(r => r.method === 'PATCH' && r.pathname.includes('/comments/'));
    assert.ok(patches.length > 0, 'Should have used PATCH to update existing comment');
    const posts = result.allRequests.filter(r => r.method === 'POST' && r.pathname.includes('/comments'));
    assert.equal(posts.length, 0, 'Should NOT have created a new comment (idempotent)');
  });

  // outcome:reviewed no findings - empty scenario
  it('outcome:reviewed no findings - comment says no findings', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'empty' });
    assert.equal(result.exitCode, 0);
    const allBodies = [...result.commentBodies, ...result.patchBodies];
    assert.ok(allBodies.length > 0);
    assert.ok(allBodies[0].includes('_No findings in this review._'));
  });

  // outcome:skipped_stale - head SHA differs
  it('outcome:skipped_stale - head SHA mismatch: no comment posted', async () => {
    // PR head is SHA40 but we pass SHA40B as REVIEW_HEAD_SHA
    world.setPR({
      number: 1, state: 'open', draft: false,
      author_association: 'MEMBER',
      head: { sha: SHA40, ref: 'feature' },  // PR head is SHA40
      base: { ref: 'main' },
    });
    const result = await runPipeline({ REVIEW_HEAD_SHA: SHA40B, FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.exitCode, 0);
    const allComments = result.allRequests.filter(r =>
      (r.method === 'POST' || r.method === 'PATCH') && r.pathname.includes('/comments')
    );
    assert.equal(allComments.length, 0, 'No comment should be posted for stale run');
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.ok(summary);
    assert.equal(summary.outcome, 'skipped_stale');
  });

  // outcome:skipped_gate draft
  it('outcome:skipped_gate draft - no comment posted', async () => {
    world.setPR({
      number: 1, state: 'open', draft: true,
      author_association: 'MEMBER',
      head: { sha: SHA40, ref: 'feature' },
      base: { ref: 'main' },
    });
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.exitCode, 0);
    const allComments = result.allRequests.filter(r =>
      (r.method === 'POST' || r.method === 'PATCH') && r.pathname.includes('/comments')
    );
    assert.equal(allComments.length, 0, 'No comment should be posted for draft PR');
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.equal(summary?.outcome, 'skipped_gate');
  });

  // outcome:skipped_gate size_exceeded
  it('outcome:skipped_gate size_exceeded - short note comment posted', async () => {
    // Create a diff larger than 102400 bytes.
    const hugeDiff = 'diff --git a/src/big.js b/src/big.js\nindex abc..def 100644\n--- a/src/big.js\n+++ b/src/big.js\n@@ -1,1 +1,1 @@\n+' + 'x'.repeat(110000) + '\n';
    world.setDiff(hugeDiff);
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.exitCode, 0);
    const allComments = result.allRequests.filter(r =>
      (r.method === 'POST' || r.method === 'PATCH') && r.pathname.includes('/comments')
    );
    // A short note IS posted for size_exceeded.
    assert.ok(allComments.length > 0, 'Should post a short note for size_exceeded');
  });

  // outcome:skipped_gate all_lockfiles
  it('outcome:skipped_gate all_lockfiles - no comment', async () => {
    const lockDiff = 'diff --git a/package-lock.json b/package-lock.json\nindex abc..def 100644\n--- a/package-lock.json\n+++ b/package-lock.json\n@@ -1,1 +1,1 @@\n+{"lockfileVersion":2}\n';
    world.setDiff(lockDiff);
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.exitCode, 0);
    const allComments = result.allRequests.filter(r =>
      (r.method === 'POST' || r.method === 'PATCH') && r.pathname.includes('/comments')
    );
    assert.equal(allComments.length, 0, 'No comment for lockfile-only PR');
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.equal(summary?.outcome, 'skipped_gate');
  });

  // outcome:skipped_gate pr_run_limit_reached
  it('outcome:skipped_gate pr_run_limit_reached - existing comment has runs:3', async () => {
    const existingMarker = '<!-- bob-pr-review:v1 {"head":"' + SHA40 + '","runs":3,"cost_total":{"bobcoins":0.126}} -->\n> header\n';
    world.setComments([{ id: 999, body: existingMarker }]);
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.exitCode, 0);
    // Should NOT call fake-bob (gate fires before review).
    // The pipeline should have posted an unavailable note OR no comment (depends on implementation).
    // Per CONTRACTS: skipped_gate for pr_run_limit is a short note.
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.equal(summary?.outcome, 'skipped_gate');
  });

  // outcome:rejected_input - invalid REVIEW_REPO
  it('outcome:rejected_input - invalid REVIEW_REPO: no API calls, exits 0', async () => {
    const result = await runPipeline({ REVIEW_REPO: 'bad!repo', FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.exitCode, 0);
    // No GitHub API calls should have been made.
    const apiCalls = result.allRequests.filter(r => r.pathname.startsWith('/repos/'));
    assert.equal(apiCalls.length, 0, 'No API calls for rejected input');
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.equal(summary?.outcome, 'rejected_input');
  });

  // outcome:bob_unavailable timeout
  it('outcome:bob_unavailable timeout - short unavailable note posted', async () => {
    const result = await runPipeline({
      FAKE_BOB_SCENARIO: 'timeout',
      REVIEW_BOB_TIMEOUT_SECONDS: '2',
    });
    assert.equal(result.exitCode, 0);
    const allComments = result.allRequests.filter(r =>
      (r.method === 'POST' || r.method === 'PATCH') && r.pathname.includes('/comments')
    );
    assert.ok(allComments.length > 0, 'Should post unavailable note on timeout');
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    // Timeout maps to bob_unavailable or bad_model_output (timeout -> parseOutput throws)
    assert.ok(['bob_unavailable', 'bad_model_output'].includes(summary?.outcome));
  }, { timeout: 15000 });

  // outcome:bob_unavailable nonzero
  it('outcome:bob_unavailable nonzero - fake-bob exits 1: short note posted', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'nonzero' });
    assert.equal(result.exitCode, 0);
    const allComments = result.allRequests.filter(r =>
      (r.method === 'POST' || r.method === 'PATCH') && r.pathname.includes('/comments')
    );
    assert.ok(allComments.length > 0, 'Should post unavailable note on nonzero exit');
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.ok(['bob_unavailable', 'bad_model_output'].includes(summary?.outcome));
  });

  // outcome:bad_model_output malformed
  it('outcome:bad_model_output malformed - fake-bob returns malformed JSON: short note posted', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'malformed' });
    assert.equal(result.exitCode, 0);
    const allComments = result.allRequests.filter(r =>
      (r.method === 'POST' || r.method === 'PATCH') && r.pathname.includes('/comments')
    );
    assert.ok(allComments.length > 0, 'Should post unavailable note for malformed output');
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.equal(summary?.outcome, 'bad_model_output');
  });

  // outcome:bad_model_output all_hallucinated
  it('outcome:bad_model_output all_hallucinated - all findings dropped: short note posted', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'hallucinated_location' });
    assert.equal(result.exitCode, 0);
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    // All findings dropped => bad_model_output
    assert.equal(summary?.outcome, 'bad_model_output');
  });

  // canary:scm_token_not_in_bob_env
  it('canary:scm_token_not_in_bob_env - SCM tokens absent from fake-bob env (G3, G23)', async () => {
    const result = await runPipeline({
      FAKE_BOB_SCENARIO: 'env_print',
      FAKE_BOB_PRINT_ENV: '1',
      SCM_READ_TOKEN: 'scm-read-canary-value',
      SCM_COMMENT_TOKEN: 'scm-write-canary-value',
    });
    // fake-bob prints its env to stderr, which runBob captures.
    // We verify by checking that the captured requests do NOT contain the token values
    // (they would only appear if Bob somehow echoed them back into the comment).
    const allCommentBodies = [...result.commentBodies, ...result.patchBodies];
    for (const body of allCommentBodies) {
      assert.ok(!body.includes('scm-read-canary-value'), 'SCM_READ_TOKEN must not appear in comment');
      assert.ok(!body.includes('scm-write-canary-value'), 'SCM_COMMENT_TOKEN must not appear in comment');
    }
    // Also verify audit lines don't contain tokens.
    const auditStr = JSON.stringify(result.auditLines);
    assert.ok(!auditStr.includes('scm-read-canary-value'), 'SCM_READ_TOKEN must not appear in audit log');
    assert.ok(!auditStr.includes('scm-write-canary-value'), 'SCM_COMMENT_TOKEN must not appear in audit log');
  });

  // canary:no_extra_github_endpoints
  it('canary:no_extra_github_endpoints - mock API never received a non-allowed endpoint call (G34)', async () => {
    await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    const forbidden = world.capturedRequests().filter(r => {
      // Check if any request came back as 403 from the mock (which means it was not allowed).
      // We verify directly by inspecting the request methods and paths.
      const isGet = r.method === 'GET';
      const isPost = r.method === 'POST';
      const isPatch = r.method === 'PATCH';
      if (!isGet && !isPost && !isPatch) return true; // unexpected method
      if (isPost && !r.pathname.includes('/comments')) return true;
      if (isPatch && !r.pathname.includes('/comments/')) return true;
      return false;
    });
    assert.equal(forbidden.length, 0, `Unexpected API calls: ${JSON.stringify(forbidden.map(r => r.method + ' ' + r.pathname))}`);
  });

  // canary:fake_approval_stripped
  it('canary:fake_approval_stripped - approval text stripped from rendered comment (G35)', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'fake_approval' });
    assert.equal(result.exitCode, 0);
    const allBodies = [...result.commentBodies, ...result.patchBodies];
    for (const body of allBodies) {
      assert.ok(!body.includes('LGTM :white_check_mark: Approved'), 'Fake approval text must be stripped from comment');
    }
  });

  // canary:bidi_stripped
  it('canary:bidi_stripped - bidi control chars stripped from rendered comment (G17)', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'bidi' });
    assert.equal(result.exitCode, 0);
    const allBodies = [...result.commentBodies, ...result.patchBodies];
    for (const body of allBodies) {
      // Check for bidi control characters U+202A-U+202E, U+2066-U+2069
      assert.ok(!/[\u202A-\u202E\u2066-\u2069]/.test(body), 'Bidi chars must be stripped from comment');
    }
  });

  // canary:marker_no_spam - two runs produce only one comment (idempotent)
  it('canary:marker_no_spam - two pipeline runs produce only one comment (G18)', async () => {
    // Set up world for second run directly (an existing marker comment).
    const existingComment = '<!-- bob-pr-review:v1 {"head":"' + SHA40 + '","runs":1,"cost_total":{"bobcoins":0.042}} -->\n> **AI Assisted review (advisory).**\n';
    world.setDiff(SAMPLE_DIFF);
    world.setPR({
      number: 1, state: 'open', draft: false,
      author_association: 'MEMBER',
      head: { sha: SHA40, ref: 'feature' },
      base: { ref: 'main' },
    });
    world.setComments([{ id: 1001, body: existingComment }]);
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    // Should PATCH (update), not POST (create new).
    const posts = result.allRequests.filter(r => r.method === 'POST' && r.pathname.includes('/comments'));
    assert.equal(posts.length, 0, 'Second run should not create a new comment');
    const patches = result.allRequests.filter(r => r.method === 'PATCH' && r.pathname.includes('/comments/'));
    assert.ok(patches.length > 0, 'Second run should update existing comment');
  });


  // G10: kill switch
  it('G10 outcome:skipped_disabled - REVIEW_ENABLED=false: no API call, no comment', async () => {
    const result = await runPipeline({ REVIEW_ENABLED: 'false' });
    assert.equal(result.exitCode, 0);
    assert.equal(result.allRequests.length, 0, 'kill switch must stop before any API call');
  });

  // G33: rules come from the base branch ref, not the PR head
  it('G33: rule files are requested at the base ref and the rules reach the comment footer', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    const contentCalls = result.allRequests.filter(r => r.pathname.includes('/contents/'));
    assert.equal(contentCalls.length, 4);
    for (const c of contentCalls) {
      assert.equal(new URLSearchParams(c.search).get('ref'), 'main', `rules fetched at wrong ref: ${c.search}`);
    }
    const body = [...result.commentBodies, ...result.patchBodies][0];
    assert.ok(body.includes('rules: standards yes, team yes'), 'footer must show rules were loaded from base');
    assert.ok(body.includes('STD-001'), 'finding that cites a base-branch rule is kept');
  });

  it('G33: PR that edits its own rules does not change the rules used (only the base ref is read)', async () => {
    // The head branch has different rules; the mock serves rules only at ref=main.
    world.setFiles({ '.bob-review/standards.md': 'WEAKENED: no rules here' });
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    const body = [...result.commentBodies, ...result.patchBodies][0];
    assert.ok(body.includes('rules: standards yes'));
  });

  // G36 + rules: with no rules at all, a standards finding is dropped
  it('G36: with no base-branch rules, findings citing rule IDs are dropped', async () => {
    world.setRules({});
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    const body = [...result.commentBodies, ...result.patchBodies][0];
    assert.ok(body.includes('rules: standards no, team no'));
    assert.ok(!body.includes('Hardcoded secret'), 'standards finding without supplied rules must be dropped');
    assert.ok(body.includes('SQL injection risk'), 'security finding is kept');
  });

  // CONTRACTS section 8: publish_failed, no comment, exit 0
  it('outcome:publish_failed - comment API failing: exit 0, outcome logged, no crash', async () => {
    world.setFailComments(true);
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.exitCode, 0);
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.equal(summary?.outcome, 'publish_failed');
  });

  // G14: cumulative cost carried in the marker
  it('G14 G37: marker cost_total accumulates across runs', async () => {
    const prior = '<!-- bob-pr-review:v1 {"head":"' + SHA40 + '","runs":1,"cost_total":{"bobcoins":0.1}} -->\n> prior\n';
    world.setComments([{ id: 999, body: prior }]);
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    const body = result.patchBodies[0];
    const meta = JSON.parse(body.split('\n')[0].replace('<!-- bob-pr-review:v1 ', '').replace(' -->', ''));
    assert.equal(meta.runs, 2);
    assert.equal(meta.cost_total.bobcoins, 0.142);
  });

  // G14: at the cap, the earlier review is preserved
  it('G14: at the per-PR run cap the existing review comment is not overwritten', async () => {
    const prior = '<!-- bob-pr-review:v1 {"head":"' + SHA40 + '","runs":3,"cost_total":{"bobcoins":0.126}} -->\n> prior review\n';
    world.setComments([{ id: 999, body: prior }]);
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'valid' });
    assert.equal(result.patchBodies.length, 0);
    assert.equal(result.commentBodies.length, 0);
  });

  // G13 at pipeline level: a hung Bob becomes bob_unavailable, with the right outcome code
  it('G13: hung Bob is killed and the outcome is exactly bob_unavailable', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'timeout', REVIEW_BOB_TIMEOUT_SECONDS: '1' });
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.equal(summary?.outcome, 'bob_unavailable');
    assert.ok(result.commentBodies.length + result.patchBodies.length > 0);
  }, { timeout: 15000 });

  it('outcome:bob_unavailable nonzero - outcome is exactly bob_unavailable', async () => {
    const result = await runPipeline({ FAKE_BOB_SCENARIO: 'nonzero' });
    const summary = result.auditLines.find(l => l.event === 'run_summary');
    assert.equal(summary?.outcome, 'bob_unavailable');
  });

  // G3 / canary: assert the dump from fake-bob itself, not just the comment
  it('G3 G23: fake-bob environment dump contains no SCM token or canary value', async () => {
    const env = makeEnv({
      FAKE_BOB_SCENARIO: 'env_print', FAKE_BOB_PRINT_ENV: '1',
      SCM_READ_TOKEN: 'scm-read-canary-value', SCM_COMMENT_TOKEN: 'scm-write-canary-value',
      CANARY_SCM_TEST: 'xxxxxxxxxcanaryxxxxxxxxx',
    });
    const { runBob } = await import('../../reviewer/src/runBob.js');
    const { createScratch } = await import('../../reviewer/src/scratch.js');
    const { rmSync } = await import('node:fs');
    const scratch = createScratch();
    try {
      const r = await runBob({ bobBin: FAKE_BOB, scratchDir: scratch, promptText: 'x', timeoutSeconds: 30, parentEnv: env });
      assert.ok(r.stderr.includes('FAKE_BOB_ENV_DUMP:'), 'fake-bob must have dumped its environment');
      for (const secret of ['scm-read-canary-value', 'scm-write-canary-value', 'xxxxxxxxxcanaryxxxxxxxxx']) {
        assert.ok(!r.stderr.includes(secret), `${secret} leaked into the Bob process environment`);
      }
      assert.ok(r.stderr.includes('fake-bob-key'), 'BOB_API_KEY is the one credential Bob does get');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
