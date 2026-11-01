// tests/evals/cases/ev19_multi_flaw.js
// Eval case ev19 (train): multiple flaws in one file. Expects at least 2 distinct findings.
// Flaws: hard-coded secret (STD-001), no timeout on fetch (TEAM-007), insecure random (TEAM-003).
const TOKEN = 'ghp_prod_token_hardcoded_abc123';

export async function syncData(endpoint) {
  const id = Math.random().toString(36).slice(2);
  const res = await fetch(`${endpoint}/${id}`, {
    headers: { Authorization: `token ${TOKEN}` },
  });
  return res.json();
}
