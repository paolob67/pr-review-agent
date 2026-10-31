// tests/unit/workflowPolicy.test.js
// Guardrails: G1, G6, G13, G22, G24, G25, G34 (static workflow policy, ADR 0012 and 0013).
// Each test takes the real review workflow, breaks one rule and requires the policy check to
// report that rule. The unmodified workflow must be clean.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWorkflow } from '../../scripts/validation/workflow-policy.js';

const here = dirname(fileURLToPath(import.meta.url));
const REAL = readFileSync(join(here, '..', '..', 'integrations', 'github-actions', 'bob-review.yml'), 'utf8');

function mutate(find, replace) {
  assert.equal(REAL.split(find).length - 1, 1, `mutation anchor must occur once: ${find}`);
  return REAL.replace(find, () => replace);
}
const rules = (text) => checkWorkflow(text).map((x) => x.rule);

describe('workflow policy', () => {
  it('the real workflow has no violations', () => {
    assert.deepEqual(checkWorkflow(REAL), []);
  });

  it('G1: missing top-level permissions is reported', () => {
    assert.ok(rules(mutate('\npermissions: {}\n', '\n')).includes('G1'));
  });

  it('G1: a job without a permissions block is reported', () => {
    assert.ok(rules(mutate('    permissions: {}\n    environment: bob-review', '    environment: bob-review')).includes('G1'));
  });

  it('G24: rejected input ends quietly: the prompt upload tolerates a missing handoff and publish needs one', () => {
    assert.ok(REAL.includes('          path: ${{ runner.temp }}/exchange/handoff.json\n          retention-days: 1\n          if-no-files-found: ignore'));
    assert.ok(REAL.includes("needs.prepare.outputs.handoff == 'true'"));
  });

  it('S17, ADR 0014: publish has pull-requests: write and the real workflow is clean', () => {
    assert.ok(REAL.includes('    permissions:\n      pull-requests: write # create and update the one comment (S17, ADR 0014)\n    steps:'));
    assert.deepEqual(checkWorkflow(REAL), []);
  });

  it('G34: checks: write, statuses: write or contents: write on publish is reported', () => {
    for (const scope of ['checks: write', 'statuses: write', 'contents: write']) {
      assert.ok(rules(mutate('      pull-requests: write # create and update the one comment (S17, ADR 0014)\n    steps:', `      pull-requests: write # create and update the one comment (S17, ADR 0014)\n      ${scope}\n    steps:`)).includes('G34'), scope);
    }
  });

  it('G34: pull-requests: write on prepare is reported (allowed on publish only)', () => {
    assert.ok(rules(mutate('      pull-requests: read # PR metadata, diff, commits/{sha}/pulls, existing comment', '      pull-requests: write # PR metadata, diff, commits/{sha}/pulls, existing comment')).includes('G34'));
  });

  it('G25: an unexpected scope on publish is reported', () => {
    assert.ok(rules(mutate('      pull-requests: write # create and update the one comment (S17, ADR 0014)\n    steps:', '      pull-requests: write\n      models: read\n    steps:')).includes('G25'));
  });

  it('G25: issues: write on publish is no longer in the allowed set', () => {
    assert.ok(rules(mutate('      pull-requests: write # create and update the one comment (S17, ADR 0014)\n    steps:', '      pull-requests: write\n      issues: write\n    steps:')).includes('G25'));
  });

  it('G25: the review job referencing the GitHub token is reported', () => {
    assert.ok(rules(mutate('          BOB_API_KEY: ${{ secrets.BOB_API_KEY }}', '          BOB_API_KEY: ${{ secrets.BOB_API_KEY }}\n          GH_TOKEN: ${{ github.token }}')).includes('G25'));
  });

  it('G25: the Bob key in another job is reported', () => {
    const text = mutate('          REVIEW_PR_NUMBER: ${{ steps.trigger.outputs.pr_number }}', '          REVIEW_PR_NUMBER: ${{ steps.trigger.outputs.pr_number }}\n          BOB_API_KEY: ${{ secrets.BOB_API_KEY }}');
    assert.ok(rules(text).includes('G25'));
  });

  it('G25: a secret inside a run: string is reported', () => {
    assert.ok(rules(mutate('        run: bash src/integrations/github-actions/run-review.sh pr-reviewer:run', '        run: echo ${{ secrets.BOB_API_KEY }}')).includes('G25'));
  });

  it('G25: the bob-review environment on another job is reported', () => {
    assert.ok(rules(mutate('    permissions:\n      pull-requests: write # create and update the one comment (S17, ADR 0014)\n    steps:', '    environment: bob-review\n    permissions:\n      pull-requests: write # create and update the one comment (S17, ADR 0014)\n    steps:')).includes('G25'));
  });

  it('G25: secrets: inherit is reported', () => {
    assert.ok(rules(mutate('    steps:\n      - name: Download the trusted reviewer code\n        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          name: source\n          path: src\n      - name: Download the prompt\n        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          name: prompt\n          path: ${{ runner.temp }}/exchange\n      - name: Build', '    secrets: inherit\n    steps:\n      - name: Download the trusted reviewer code\n        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          name: source\n          path: src\n      - name: Download the prompt\n        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          name: prompt\n          path: ${{ runner.temp }}/exchange\n      - name: Build')).includes('G25'));
  });

  it('G13: a job without timeout-minutes is reported', () => {
    assert.ok(rules(mutate('    timeout-minutes: 8\n', '')).includes('G13'));
  });

  it('G13: an excessive timeout is reported', () => {
    assert.ok(rules(mutate('    timeout-minutes: 8\n', '    timeout-minutes: 360\n')).includes('G13'));
  });

  it('G22: an unpinned runner label is reported', () => {
    assert.ok(rules(mutate('  review:\n    name: review\n    needs: prepare\n    if: needs.prepare.outputs.proceed == \'true\'\n    runs-on: ubuntu-24.04', '  review:\n    name: review\n    needs: prepare\n    if: needs.prepare.outputs.proceed == \'true\'\n    runs-on: ubuntu-latest')).includes('G22'));
  });

  it('G22: an action pinned by tag instead of SHA is reported', () => {
    assert.ok(rules(mutate('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1', 'actions/checkout@v7')).includes('G22'));
  });

  it('G6: checking out a PR ref is reported', () => {
    assert.ok(rules(mutate('          persist-credentials: false', '          persist-credentials: false\n          ref: refs/pull/1/head')).includes('G6'));
  });

  it('G6/G12: pull_request_target is allowed only for the labeled type', () => {
    assert.ok(REAL.includes('  pull_request_target:\n    types: [labeled]\n'));
    for (const types of ['[opened, synchronize]', '[labeled, opened]', '[opened]']) {
      assert.ok(rules(mutate('  pull_request_target:\n    types: [labeled]\n', `  pull_request_target:\n    types: ${types}\n`)).includes('G6'), types);
    }
    assert.ok(rules(mutate('  pull_request_target:\n    types: [labeled]\n', '  pull_request_target:\n    branches: [main]\n')).includes('G6'));
  });

  it('G6: a checkout of the pull request head under pull_request_target is reported', () => {
    for (const extra of ['ref: ${{ github.event.pull_request.head.sha }}', 'repository: attacker/fork']) {
      assert.ok(rules(mutate('          persist-credentials: false', `          persist-credentials: false\n          ${extra}`)).some((r) => r === 'G6' || r === 'G24'), extra);
    }
  });

  it('G12: the label trigger and the workflow_run trigger both stay in the prepare gate', () => {
    assert.ok(REAL.includes("(github.event_name == 'pull_request_target' && github.event.label.name == 'ai-review')"));
    assert.ok(REAL.includes("github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'pull_request'"));
  });

  it('G11: concurrency is per pull request on the review and publish jobs, not on the workflow', () => {
    assert.ok(!REAL.includes('\nconcurrency:'), 'a workflow-level group would let a quiet run cancel a real review');
    assert.ok(REAL.includes('      group: bob-review-run-${{ needs.prepare.outputs.pr_number }}\n      cancel-in-progress: true\n'));
    assert.ok(REAL.includes('      group: bob-review-publish-${{ needs.prepare.outputs.pr_number }}\n      cancel-in-progress: false\n'));
    assert.ok(REAL.includes("needs.review.result != 'cancelled'"));
  });

  it('G24: trigger values reach the script only through env, and the script call has no expression', () => {
    assert.ok(REAL.includes('        run: node integrations/github-actions/scripts/resolve-trigger.mjs\n'));
    assert.ok(REAL.includes('          TRIGGER_HEAD_SHA: ${{ github.event.workflow_run.head_sha || inputs.head_sha }}'));
  });

  it('G24: PR-controlled context in a run: string is reported', () => {
    assert.ok(rules(mutate('        run: node reviewer/bin/reviewer.js prepare', '        run: echo "${{ github.event.workflow_run.head_branch }}"')).includes('G24'));
  });

  it('G24: any use of the PR title or head ref is reported', () => {
    assert.ok(rules(mutate('  REVIEW_ENABLED: ${{ vars.BOB_REVIEW_ENABLED }}', '  REVIEW_ENABLED: ${{ vars.BOB_REVIEW_ENABLED }}\n  PR_TITLE: ${{ github.event.pull_request.title }}')).includes('G24'));
  });

  it('G24: even a harmless expression inside a run: string is reported', () => {
    assert.ok(rules(mutate('        run: node reviewer/bin/reviewer.js prepare', '        run: echo ${{ runner.temp }}')).includes('G24'));
  });
});
