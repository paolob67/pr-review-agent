// tests/unit/gate.test.js
// Unit tests for gate.js
// Guardrails covered: G7 (author policy), G8 (size gates), G9 (skip rules), G14 (budget), G32 (head pin)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkHeadPin, checkAuthor, checkDraft,
  checkSizes, checkPaths, checkBudget,
} from '../../reviewer/src/gate.js';

const SHA40 = 'a'.repeat(40);
const SHA40B = 'b'.repeat(40);

const CONFIG = { maxFiles: 50, maxDiffBytes: 102400, maxRunsPerPR: 3, maxRunsPerDay: 30, dailySpendCapUsd: 10.0 };

function makePR(overrides = {}) {
  return {
    state: 'open', draft: false, author_association: 'MEMBER',
    head: { sha: SHA40 }, base: { ref: 'main' },
    ...overrides,
  };
}

describe('gate.js - checkHeadPin (G32)', () => {
  it('G32: matching SHA and open PR returns null (proceed)', () => {
    const result = checkHeadPin(makePR(), SHA40);
    assert.equal(result, null);
  });

  it('G32: closed PR returns skipped_stale', () => {
    const result = checkHeadPin(makePR({ state: 'closed' }), SHA40);
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_stale');
  });

  it('G32: head SHA mismatch returns skipped_stale', () => {
    const result = checkHeadPin(makePR(), SHA40B);
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_stale');
    assert.equal(result.reason, 'head_moved');
  });
});

describe('gate.js - checkAuthor (G7)', () => {
  it('G7: OWNER is allowed', () => {
    assert.equal(checkAuthor(makePR({ author_association: 'OWNER' })), null);
  });

  it('G7: MEMBER is allowed', () => {
    assert.equal(checkAuthor(makePR({ author_association: 'MEMBER' })), null);
  });

  it('G7: COLLABORATOR is allowed', () => {
    assert.equal(checkAuthor(makePR({ author_association: 'COLLABORATOR' })), null);
  });

  it('G7: CONTRIBUTOR is blocked (author_policy)', () => {
    const result = checkAuthor(makePR({ author_association: 'CONTRIBUTOR' }));
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
    assert.equal(result.reason, 'author_policy');
  });

  it('G7: NONE is blocked', () => {
    const result = checkAuthor(makePR({ author_association: 'NONE' }));
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
  });
});

describe('gate.js - checkDraft (G9)', () => {
  it('G9: non-draft returns null', () => {
    assert.equal(checkDraft(makePR({ draft: false })), null);
  });

  it('G9: draft PR returns skipped_gate with reason draft', () => {
    const result = checkDraft(makePR({ draft: true }));
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
    assert.equal(result.reason, 'draft');
  });
});

describe('gate.js - checkSizes (G8)', () => {
  it('G8: within limits returns null', () => {
    assert.equal(checkSizes(10, 1024, CONFIG), null);
  });

  it('G8: file count exceeded returns skipped_gate size_exceeded', () => {
    const result = checkSizes(51, 1024, CONFIG);
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
    assert.equal(result.reason, 'size_exceeded');
  });

  it('G8: diff bytes exceeded returns skipped_gate size_exceeded', () => {
    const result = checkSizes(5, 200000, CONFIG);
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
    assert.equal(result.reason, 'size_exceeded');
  });

  it('G8: exactly at limit does not trigger gate', () => {
    assert.equal(checkSizes(50, 102400, CONFIG), null);
  });
});

describe('gate.js - checkPaths (G9)', () => {
  it('G9: mixed paths (some non-ignored) returns null', () => {
    assert.equal(checkPaths(['src/main.js', 'package-lock.json']), null);
  });

  it('G9: all lockfiles returns skipped_gate ignored_paths', () => {
    const result = checkPaths(['package-lock.json', 'yarn.lock']);
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
    assert.equal(result.reason, 'ignored_paths');
  });

  it('G9: all markdown files returns skipped_gate', () => {
    const result = checkPaths(['README.md', 'docs/guide.md']);
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
  });

  it('G9: .lock extension is ignored', () => {
    const result = checkPaths(['Gemfile.lock', 'poetry.lock']);
    assert.ok(result);
    assert.equal(result.reason, 'ignored_paths');
  });

  it('G9: dist/ prefixed file is ignored', () => {
    const result = checkPaths(['dist/bundle.js']);
    assert.ok(result);
    assert.equal(result.reason, 'ignored_paths');
  });

  it('G9: empty file list returns null', () => {
    assert.equal(checkPaths([]), null);
  });
});

describe('gate.js - checkBudget (G14)', () => {
  it('G14: under all limits returns null', () => {
    assert.equal(checkBudget(0, 0, 0, CONFIG), null);
  });

  it('G14: per-PR run cap reached returns skipped_gate pr_run_limit_reached', () => {
    const result = checkBudget(3, 0, 0, CONFIG);
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
    assert.equal(result.reason, 'pr_run_limit_reached');
  });

  it('G14: daily run cap reached returns skipped_gate daily_run_limit', () => {
    const result = checkBudget(0, 30, 0, CONFIG);
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
    assert.equal(result.reason, 'daily_run_limit');
  });

  it('G14: daily spend cap reached returns skipped_gate daily_spend_cap', () => {
    const result = checkBudget(0, 0, 10.0, CONFIG);
    assert.ok(result);
    assert.equal(result.outcome, 'skipped_gate');
    assert.equal(result.reason, 'daily_spend_cap');
  });

  it('G14: 2 runs is below limit of 3', () => {
    assert.equal(checkBudget(2, 0, 0, CONFIG), null);
  });
});
