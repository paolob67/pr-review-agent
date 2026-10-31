// config.js
// Guardrails: G24 (validated env-var configuration)
// Reads and validates all configuration from environment variables.
// No runtime dependencies; uses only Node.js built-ins.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, '..', 'config');

function loadJson(name) {
  return JSON.parse(readFileSync(join(CONFIG_DIR, name), 'utf8'));
}

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer, got: ${v}`);
  return n;
}

function envFloat(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got: ${v}`);
  return n;
}

function envStr(name, fallback) {
  const v = process.env[name];
  return (v !== undefined && v !== '') ? v : fallback;
}

// getConfig returns a validated configuration object. Throws if any required
// value is malformed. Called once at startup; callers cache the result.
// Accepts an optional env parameter so tests can pass a custom environment.
export function getConfig(envMap = process.env) {
  const caps = loadJson('caps.json');
  const thresholds = loadJson('thresholds.json');

  function envStrL(name, fallback) {
    const v = envMap[name];
    return (v !== undefined && v !== '') ? v : fallback;
  }
  function envIntL(name, fallback) {
    const v = envMap[name];
    if (v === undefined || v === '') return fallback;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer, got: ${v}`);
    return n;
  }
  function envFloatL(name, fallback) {
    const v = envMap[name];
    if (v === undefined || v === '') return fallback;
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got: ${v}`);
    return n;
  }

  return {
    // Kill switch (G10)
    enabled: envStrL('REVIEW_ENABLED', 'true') === 'true',

    // Size gates (G8)
    maxFiles:      envIntL('REVIEW_MAX_FILES',      caps.maxFilesPerPR),
    maxDiffBytes:  envIntL('REVIEW_MAX_DIFF_BYTES',  caps.maxDiffBytes),
    maxPromptBytes: envIntL('REVIEW_MAX_PROMPT_BYTES', caps.maxPromptBytes),

    // Bob process timeout (G13)
    bobTimeoutSeconds: envIntL('REVIEW_BOB_TIMEOUT_SECONDS', caps.bobTimeoutSeconds),

    // Budget caps (G14)
    maxRunsPerPR:    envIntL('REVIEW_MAX_RUNS_PER_PR',  caps.maxRunsPerPR),

    // GitHub API base URL (for tests to point at mock server)
    apiBase: envStrL('REVIEW_API_BASE', 'https://api.github.com'),

    // Bob executable path
    bobBin: envStrL('REVIEW_BOB_BIN', 'bob'),

    // Triage caps (G36)
    maxFindingsTotal: caps.maxFindingsTotal,
    maxFindingsPerCategory: caps.maxFindingsPerCategory,

    // Confidence threshold: findings below this level move to needs_human_attention
    confidenceDropBelow: thresholds.confidenceDropBelow,
    ruleSizeLimitBytes: thresholds.ruleSizeLimitBytes,
  };
}

export default getConfig;
