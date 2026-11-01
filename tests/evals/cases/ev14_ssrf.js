// tests/evals/cases/ev14_ssrf.js
// Eval case ev14 (train): server-side request forgery (STD-003 / security).
// Expected: security finding, high severity, on the fetch line.
export async function fetchByUrl(req, res) {
  const target = req.query.url;
  const data = await fetch(target);
  const body = await data.text();
  res.send(body);
}
