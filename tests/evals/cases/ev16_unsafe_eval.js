// tests/evals/cases/ev16_unsafe_eval.js
// Eval case ev16 (train): unsafe use of eval() on untrusted input (security).
// Expected: security finding, critical severity, on the eval line.
export function runExpr(userInput) {
  // eslint-disable-next-line no-eval
  return eval(userInput);
}
