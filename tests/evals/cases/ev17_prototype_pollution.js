// tests/evals/cases/ev17_prototype_pollution.js
// Eval case ev17 (train): prototype pollution risk via recursive merge (security).
// Expected: security finding, high severity, on the merge logic.
export function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
