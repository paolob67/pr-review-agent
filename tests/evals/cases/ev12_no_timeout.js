// tests/evals/cases/ev12_no_timeout.js
// Eval case ev12 (train): violates TEAM-007 (timeouts on external calls).
// Expected: team_rule finding citing TEAM-007, medium severity.
export async function callExternalService(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}
