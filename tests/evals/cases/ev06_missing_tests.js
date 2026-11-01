// tests/evals/cases/ev06_missing_tests.js
// Eval case ev06 (train): new behaviour added in src/ but no test file changed (STD-006, TEAM-001).
// Expected: standards finding citing STD-006, medium severity; team_rule finding citing TEAM-001.
export function calculateDiscount(price, pct) {
  if (pct < 0 || pct > 100) throw new RangeError('invalid percentage');
  return price * (1 - pct / 100);
}

export function applyVoucher(price, code) {
  const discounts = { SAVE10: 10, SAVE20: 20 };
  const pct = discounts[code] ?? 0;
  return calculateDiscount(price, pct);
}
