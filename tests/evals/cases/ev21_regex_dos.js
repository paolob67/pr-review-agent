// tests/evals/cases/ev21_regex_dos.js
// Eval case ev21 (HELD-OUT): catastrophic backtracking regex on untrusted input (security).
// Expected: security finding, high severity, on the regex line.
export function validateEmail(email) {
  const re = /^([a-zA-Z0-9]+)*@[a-zA-Z0-9]+\.[a-zA-Z]{2,}$/;
  return re.test(email);
}
