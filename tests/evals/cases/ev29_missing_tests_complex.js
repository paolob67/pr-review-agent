// tests/evals/cases/ev29_missing_tests_complex.js
// Eval case ev29 (HELD-OUT): complex new module with no tests (STD-006, TEAM-001).
// Expected: findings citing STD-006 and TEAM-001; no false security alarms.
export class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.counters = new Map();
  }

  check(clientId) {
    const now = Date.now();
    const entry = this.counters.get(clientId) ?? { count: 0, start: now };
    if (now - entry.start > this.windowMs) {
      entry.count = 0;
      entry.start = now;
    }
    entry.count += 1;
    this.counters.set(clientId, entry);
    return entry.count <= this.maxRequests;
  }
}
