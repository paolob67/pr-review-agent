// tests/evals/cases/ev27_noisy_but_fine.js
// Eval case ev27 (HELD-OUT): NOISY-BUT-FINE - code that looks suspicious but is correct.
// Expected: zero or only info/low findings that a human would dismiss.
// Pattern: using eval-like function name that is actually safe, and TODO comment.
export function parseConfig(raw) {
  // TODO: add schema validation in a future PR
  return JSON.parse(raw);
}

export function buildQuery(table, conditions) {
  const keys = Object.keys(conditions);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = Object.values(conditions);
  return { text: `SELECT * FROM ${table} WHERE id IN (${placeholders})`, values };
}
