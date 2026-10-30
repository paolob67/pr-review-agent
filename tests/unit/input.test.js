// tests/unit/input.test.js
// Unit tests for input.js
// Guardrails covered: G24 (strict input validation)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateInputs, InputError } from '../../reviewer/src/input.js';

describe('input.js (G24)', () => {
  it('G24: valid inputs pass validation', () => {
    const result = validateInputs({
      REVIEW_REPO: 'owner/repo',
      REVIEW_PR_NUMBER: '42',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    });
    assert.equal(result.repo, 'owner/repo');
    assert.equal(result.prNumber, 42);
    assert.equal(result.headSha, 'a'.repeat(40));
  });

  it('G24: valid inputs with dots and dashes pass', () => {
    const result = validateInputs({
      REVIEW_REPO: 'my-org/my-repo.js',
      REVIEW_PR_NUMBER: '1',
      REVIEW_HEAD_SHA: '0'.repeat(40),
    });
    assert.equal(result.repo, 'my-org/my-repo.js');
  });

  it('G24: missing repo fails with InputError', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: '',
      REVIEW_PR_NUMBER: '42',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    }), InputError);
  });

  it('G24: short repo name (no slash) fails', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'justarepo',
      REVIEW_PR_NUMBER: '42',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    }), InputError);
  });

  it('G24: repo name too long fails', () => {
    const longName = 'a'.repeat(101);
    assert.throws(() => validateInputs({
      REVIEW_REPO: `owner/${longName}`,
      REVIEW_PR_NUMBER: '42',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    }), InputError);
  });

  it('G24: injection attempt in repo name rejected (shell metacharacters)', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'owner/repo; rm -rf /',
      REVIEW_PR_NUMBER: '42',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    }), InputError);
  });

  it('G24: injection with backtick rejected', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'owner/`cat /etc/passwd`',
      REVIEW_PR_NUMBER: '42',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    }), InputError);
  });

  it('G24: PR number zero is rejected', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'owner/repo',
      REVIEW_PR_NUMBER: '0',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    }), InputError);
  });

  it('G24: PR number with leading zero is rejected', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'owner/repo',
      REVIEW_PR_NUMBER: '007',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    }), InputError);
  });

  it('G24: PR number too long (10 digits) is rejected', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'owner/repo',
      REVIEW_PR_NUMBER: '1234567890',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    }), InputError);
  });

  it('G24: PR number as float rejected', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'owner/repo',
      REVIEW_PR_NUMBER: '1.5',
      REVIEW_HEAD_SHA: 'a'.repeat(40),
    }), InputError);
  });

  it('G24: SHA with uppercase letters rejected', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'owner/repo',
      REVIEW_PR_NUMBER: '42',
      REVIEW_HEAD_SHA: 'A'.repeat(40),
    }), InputError);
  });

  it('G24: SHA that is 39 chars rejected', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'owner/repo',
      REVIEW_PR_NUMBER: '42',
      REVIEW_HEAD_SHA: 'a'.repeat(39),
    }), InputError);
  });

  it('G24: SHA with non-hex chars rejected', () => {
    assert.throws(() => validateInputs({
      REVIEW_REPO: 'owner/repo',
      REVIEW_PR_NUMBER: '42',
      REVIEW_HEAD_SHA: 'g'.repeat(40),
    }), InputError);
  });

  it('G24: thrown error has outcome=rejected_input', () => {
    let err;
    try {
      validateInputs({ REVIEW_REPO: 'bad', REVIEW_PR_NUMBER: '42', REVIEW_HEAD_SHA: 'a'.repeat(40) });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof InputError);
    assert.equal(err.outcome, 'rejected_input');
  });
});
