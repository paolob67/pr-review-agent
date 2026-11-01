// tests/evals/cases/ev30_clean_network.js
// Eval case ev30 (HELD-OUT): CLEAN network code with all safeguards.
// Expected: zero findings.
import https from 'node:https';

const ALLOWED_HOSTS = new Set(['api.example.test', 'cdn.example.test']);

export async function fetchSafe(url, ms = 5000) {
  const parsed = new URL(url);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`host ${parsed.hostname} not allowed`);
  if (parsed.protocol !== 'https:') throw new Error('only HTTPS allowed');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const agent = new https.Agent({ rejectUnauthorized: true });
  try {
    const res = await fetch(url, { signal: controller.signal, agent });
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
