// tests/evals/cases/ev23_open_redirect.js
// Eval case ev23 (HELD-OUT): open redirect via unvalidated Location header (security).
// Expected: security finding, high severity, on the res.redirect line.
export function loginCallback(req, res) {
  const next = req.query.redirect;
  res.redirect(next || '/dashboard');
}
