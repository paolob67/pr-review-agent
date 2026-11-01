// tests/evals/cases/ev11_tls_disabled.js
// Eval case ev11 (train): violates TEAM-005 (transport security - cert verification disabled).
// Expected: team_rule finding citing TEAM-005, high severity.
import https from 'node:https';

export function fetchInternal(url) {
  const agent = new https.Agent({ rejectUnauthorized: false });
  return fetch(url, { agent });
}
