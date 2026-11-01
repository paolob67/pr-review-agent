// tests/evals/cases/ev26_stack_trace_leak.js
// Eval case ev26 (HELD-OUT): stack trace or internal path leaked to the user response (STD-005).
// Expected: standards finding citing STD-005, medium severity.
export function handleRequest(req, res) {
  try {
    const data = JSON.parse(req.body);
    processData(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.stack });
  }
}

function processData(d) { if (!d) throw new Error('no data'); }
