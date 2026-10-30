// input.js
// Guardrails: G24 (strict input validation before any API call)
// Validates the three job inputs passed as environment variables.
// Returns validated values or throws with outcome 'rejected_input'.
// No runtime dependencies.

const REPO_RE  = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const PR_RE    = /^[1-9][0-9]{0,8}$/;
const SHA_RE   = /^[0-9a-f]{40}$/;

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.outcome = 'rejected_input';
  }
}

// validateInputs reads REVIEW_REPO, REVIEW_PR_NUMBER, REVIEW_HEAD_SHA from
// the environment, validates them, and returns { repo, prNumber, headSha }.
// Throws InputError (outcome: rejected_input) on any validation failure (G24).
export function validateInputs(env = process.env) {
  const repo     = env.REVIEW_REPO      ?? '';
  const prRaw    = env.REVIEW_PR_NUMBER ?? '';
  const headSha  = env.REVIEW_HEAD_SHA  ?? '';

  if (!REPO_RE.test(repo)) {
    throw new InputError(`REVIEW_REPO is invalid: "${repo}". Expected owner/name matching ^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$`);
  }
  if (!PR_RE.test(prRaw)) {
    throw new InputError(`REVIEW_PR_NUMBER is invalid: "${prRaw}". Expected positive integer matching ^[1-9][0-9]{0,8}$`);
  }
  if (!SHA_RE.test(headSha)) {
    throw new InputError(`REVIEW_HEAD_SHA is invalid: "${headSha}". Expected 40 lowercase hex characters`);
  }

  return { repo, prNumber: parseInt(prRaw, 10), headSha };
}

export default validateInputs;
