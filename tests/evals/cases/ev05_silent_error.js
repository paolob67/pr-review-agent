// tests/evals/cases/ev05_silent_error.js
// Eval case ev05 (train): violates STD-005 (do not swallow errors silently).
// Expected: standards finding citing STD-005, medium severity.
export async function fetchData(url) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    // silent swallow
  }
  return null;
}
