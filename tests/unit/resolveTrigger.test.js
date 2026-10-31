// tests/unit/resolveTrigger.test.js
// Guardrails: G12 (triggers), G24 (PR resolved through the API from validated identifiers),
//             G31 (all required CI workflows green for the exact head SHA), G32 (head from the API),
//             G6 (nothing but API reads).
// The trigger script is run with an injected fetch; no network.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrigger, parseRequired, evaluateRequired } from '../../integrations/github-actions/scripts/resolve-trigger.mjs';

const SHA = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);
const REPO = 'o/r';

const pull = (over = {}) => ({ number: 7, state: 'open', head: { sha: SHA }, base: { repo: { full_name: REPO } }, ...over });
const run = (name, over = {}) => ({ name, event: 'pull_request', status: 'completed', conclusion: 'success', run_number: 1, ...over });

// fake GitHub: routes by path prefix, records calls.
function fakeGithub({ commitPulls = [pull()], pr = pull(), runs = [run('CI')], fail = null } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    calls.push(path);
    if (fail && path.includes(fail)) return { status: 500, json: async () => ({}) };
    if (path.startsWith(`/repos/${REPO}/commits/`)) return { status: 200, json: async () => commitPulls };
    if (path.startsWith(`/repos/${REPO}/pulls/`)) return { status: 200, json: async () => pr };
    if (path.startsWith(`/repos/${REPO}/actions/runs`)) return { status: 200, json: async () => ({ workflow_runs: runs }) };
    return { status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

const env = (over = {}) => ({
  REVIEW_REPO: REPO, TRIGGER_EVENT: 'workflow_run', TRIGGER_HEAD_SHA: SHA, TRIGGER_WORKFLOW_NAME: 'CI',
  REVIEW_REQUIRED_WORKFLOWS: 'CI', SCM_READ_TOKEN: 'read-token-canary', REVIEW_API_BASE: 'http://x.invalid', ...over,
});

describe('parseRequired (G31)', () => {
  it('splits, trims and de-duplicates', () => {
    assert.deepEqual(parseRequired(' CI , Lint,CI ', ''), ['CI', 'Lint']);
  });
  it('falls back to the triggering workflow when the variable is empty (ADR 0003)', () => {
    assert.deepEqual(parseRequired('', 'CI'), ['CI']);
    assert.deepEqual(parseRequired(undefined, 'CI'), ['CI']);
  });
  it('fails closed on an invalid name or when nothing is known', () => {
    assert.equal(parseRequired('CI,$(id)', ''), null);
    assert.equal(parseRequired('', ''), null);
  });
});

describe('evaluateRequired (G31)', () => {
  it('all green passes', () => {
    assert.deepEqual(evaluateRequired([run('CI'), run('Lint')], ['CI', 'Lint']), { ok: true });
  });
  it('a missing required workflow blocks', () => {
    assert.deepEqual(evaluateRequired([run('CI')], ['CI', 'Lint']), { ok: false, reason: 'ci_missing', name: 'Lint' });
  });
  it('pending, failed, cancelled, skipped and action_required block', () => {
    assert.equal(evaluateRequired([run('CI', { status: 'in_progress', conclusion: null })], ['CI']).reason, 'ci_pending');
    for (const conclusion of ['failure', 'cancelled', 'skipped', 'action_required', 'timed_out', null]) {
      assert.equal(evaluateRequired([run('CI', { conclusion })], ['CI']).reason, 'ci_not_green', String(conclusion));
    }
  });
  it('the newest run of a workflow counts: a green re-run beats an older red, a newer red beats an older green', () => {
    assert.equal(evaluateRequired([run('CI', { conclusion: 'failure', run_number: 1 }), run('CI', { run_number: 2 })], ['CI']).ok, true);
    assert.equal(evaluateRequired([run('CI', { run_number: 1 }), run('CI', { conclusion: 'failure', run_number: 2 })], ['CI']).ok, false);
  });
  it('a push-event run with the same name does not count', () => {
    assert.equal(evaluateRequired([run('CI', { event: 'push' })], ['CI']).reason, 'ci_missing');
  });
});

describe('resolveTrigger: workflow_run', () => {
  it('green CI for an open PR with this head is ready', async () => {
    const { fetchImpl, calls } = fakeGithub();
    const r = await resolveTrigger(env(), fetchImpl);
    assert.deepEqual(r, { ready: true, reason: 'ci_green', prNumber: '7', headSha: SHA });
    assert.ok(calls.every((c) => c.startsWith('/repos/o/r/')));
  });

  it('G31: one of two required workflows red or missing is not ready, and names the workflow', async () => {
    const red = await resolveTrigger(env({ REVIEW_REQUIRED_WORKFLOWS: 'CI,Lint' }), fakeGithub({ runs: [run('CI'), run('Lint', { conclusion: 'failure' })] }).fetchImpl);
    assert.deepEqual([red.ready, red.reason, red.name], [false, 'ci_not_green', 'Lint']);
    const missing = await resolveTrigger(env({ REVIEW_REQUIRED_WORKFLOWS: 'CI,Lint' }), fakeGithub().fetchImpl);
    assert.deepEqual([missing.ready, missing.reason], [false, 'ci_missing']);
  });

  it('G31: pending CI (last required workflow not finished) is not ready', async () => {
    const r = await resolveTrigger(env({ REVIEW_REQUIRED_WORKFLOWS: 'CI,Lint' }), fakeGithub({ runs: [run('CI'), run('Lint', { status: 'in_progress', conclusion: null })] }).fetchImpl);
    assert.equal(r.reason, 'ci_pending');
  });

  it('G32: no open PR with exactly this head (moved head, closed PR, other base repo) is not ready', async () => {
    for (const commitPulls of [[], [pull({ head: { sha: SHA2 } })], [pull({ state: 'closed' })], [pull({ base: { repo: { full_name: 'x/y' } } })]]) {
      const r = await resolveTrigger(env(), fakeGithub({ commitPulls }).fetchImpl);
      assert.deepEqual([r.ready, r.reason], [false, 'no_open_pr']);
    }
  });

  it('two open PRs for one SHA are ambiguous and not reviewed', async () => {
    const r = await resolveTrigger(env(), fakeGithub({ commitPulls: [pull(), pull({ number: 8 })] }).fetchImpl);
    assert.equal(r.reason, 'ambiguous_pr');
  });

  it('G24: an invalid head SHA is rejected before any API call', async () => {
    const { fetchImpl, calls } = fakeGithub();
    for (const sha of ['', 'abc', 'A'.repeat(40), `${SHA};id`]) {
      const r = await resolveTrigger(env({ TRIGGER_HEAD_SHA: sha }), fetchImpl);
      assert.deepEqual([r.ready, r.reason], [false, 'rejected_input']);
    }
    assert.equal(calls.length, 0);
  });

  it('G24: an invalid repo or event is rejected before any API call', async () => {
    const { fetchImpl, calls } = fakeGithub();
    assert.equal((await resolveTrigger(env({ REVIEW_REPO: 'o/r;id' }), fetchImpl)).reason, 'rejected_input');
    assert.equal((await resolveTrigger(env({ TRIGGER_EVENT: 'push' }), fetchImpl)).reason, 'rejected_input');
    assert.equal((await resolveTrigger(env({ SCM_READ_TOKEN: '' }), fetchImpl)).reason, 'rejected_input');
    assert.equal(calls.length, 0);
  });

  it('an invalid required-workflow list fails closed', async () => {
    const r = await resolveTrigger(env({ REVIEW_REQUIRED_WORKFLOWS: 'CI;rm' }), fakeGithub().fetchImpl);
    assert.equal(r.reason, 'no_required_ci');
  });

  it('an API error is a quiet stop, not a crash, and the token is not in any call path', async () => {
    const { fetchImpl, calls } = fakeGithub({ fail: '/actions/runs' });
    const r = await resolveTrigger(env(), fetchImpl);
    assert.deepEqual([r.ready, r.reason], [false, 'api_error']);
    assert.ok(!calls.some((c) => c.includes('read-token-canary')));
  });
});

describe('resolveTrigger: pull_request_target (label)', () => {
  const labelEnv = (over = {}) => env({ TRIGGER_EVENT: 'pull_request_target', TRIGGER_PR_NUMBER: '7', TRIGGER_HEAD_SHA: '', ...over });

  it('takes the head SHA from the API, never from the event, and still needs green CI', async () => {
    const ok = await resolveTrigger(labelEnv({ TRIGGER_HEAD_SHA: SHA2 }), fakeGithub().fetchImpl);
    assert.deepEqual(ok, { ready: true, reason: 'label_ci_green', prNumber: '7', headSha: SHA });
    const red = await resolveTrigger(labelEnv(), fakeGithub({ runs: [run('CI', { conclusion: 'failure' })] }).fetchImpl);
    assert.equal(red.reason, 'ci_not_green');
  });

  it('a closed PR or a PR of another repository is not reviewed', async () => {
    assert.equal((await resolveTrigger(labelEnv(), fakeGithub({ pr: pull({ state: 'closed' }) }).fetchImpl)).reason, 'no_open_pr');
    assert.equal((await resolveTrigger(labelEnv(), fakeGithub({ pr: pull({ base: { repo: { full_name: 'x/y' } } }) }).fetchImpl)).reason, 'rejected_input');
  });

  it('G24: a non-integer PR number is rejected before any API call', async () => {
    const { fetchImpl, calls } = fakeGithub();
    for (const n of ['', '0', '7;id', '-1', '1234567890']) {
      assert.equal((await resolveTrigger(labelEnv({ TRIGGER_PR_NUMBER: n }), fetchImpl)).reason, 'rejected_input', n);
    }
    assert.equal(calls.length, 0);
  });
});

describe('resolveTrigger: workflow_dispatch', () => {
  it('is validated and skips the CI check (write access is needed to dispatch)', async () => {
    const { fetchImpl, calls } = fakeGithub();
    const r = await resolveTrigger(env({ TRIGGER_EVENT: 'workflow_dispatch', TRIGGER_PR_NUMBER: '3' }), fetchImpl);
    assert.deepEqual(r, { ready: true, reason: 'manual', prNumber: '3', headSha: SHA });
    assert.equal(calls.length, 0);
    assert.equal((await resolveTrigger(env({ TRIGGER_EVENT: 'workflow_dispatch', TRIGGER_PR_NUMBER: '3;id' }), fetchImpl)).reason, 'rejected_input');
  });
});
