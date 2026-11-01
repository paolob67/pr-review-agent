// tests/evals/cases/ev09_insecure_random.js
// Eval case ev09 (train): violates TEAM-003 (approved randomness for security-relevant values).
// Expected: team_rule finding citing TEAM-003, high severity.
export function generateSessionToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
