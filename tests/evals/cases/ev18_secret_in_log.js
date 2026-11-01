// tests/evals/cases/ev18_secret_in_log.js
// Eval case ev18 (train): secret logged in plain text (STD-011, STD-001).
// Expected: standards finding citing STD-011, medium severity, on the console.log line.
export function authenticate(username, password) {
  console.log(`Auth attempt: user=${username} pass=${password}`);
  return checkCredentials(username, password);
}

function checkCredentials(u, p) { return u === 'admin' && p === 'secret'; }
