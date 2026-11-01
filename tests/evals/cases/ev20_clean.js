// tests/evals/cases/ev20_clean.js
// Eval case ev20 (train): CLEAN PR - no real flaws. Used to measure false-positive rate.
// Expected: zero findings (or only info-level observations that a human would dismiss).
import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const BASE = resolve('/data/uploads');

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function readUserFile(filename, db) {
  const safe = resolve(BASE, filename);
  if (!safe.startsWith(BASE + '/')) throw new Error('path traversal attempt');
  return readFileSync(safe, 'utf8');
}

export async function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
