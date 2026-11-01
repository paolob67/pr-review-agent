// tests/evals/cases/ev07_dead_code.js
// Eval case ev07 (train): commented-out code block (STD-007).
// Expected: standards finding citing STD-007, low or info severity.
export function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

// function oldFormatDate(d) {
//   const y = d.getFullYear();
//   const m = String(d.getMonth() + 1).padStart(2, '0');
//   const day = String(d.getDate()).padStart(2, '0');
//   return `${y}-${m}-${day}`;
// }
