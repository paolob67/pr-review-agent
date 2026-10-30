#!/usr/bin/env node
// scripts/validation/lint.js
// Static checks for the reviewer source and tests.
//
// Checks:
// 1. No em-dash character (U+2014) in any .js file under reviewer/src/ or tests/
// 2. Every file under reviewer/src/ has a comment mentioning at least one guardrail ID (G\d+)
//
// No runtime dependencies.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const EM_DASH = '\u2014';
const GUARDRAIL_RE = /\bG\d+\b/;

let errors = 0;
let checked = 0;

function walkJs(dir, callback) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      walkJs(full, callback);
    } else if (entry.endsWith('.js')) {
      callback(full);
    }
  }
}

function check(filePath, requireGuardrail) {
  checked++;
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error(`  [ERROR] Cannot read ${filePath}: ${e.message}`);
    errors++;
    return;
  }

  const rel = relative(ROOT, filePath);

  // Check 1: no em-dash
  if (content.includes(EM_DASH)) {
    console.error(`  [FAIL] Em-dash (U+2014) found in ${rel}`);
    errors++;
  }

  // Check 2: guardrail reference
  if (requireGuardrail && !GUARDRAIL_RE.test(content)) {
    console.error(`  [FAIL] No guardrail ID (G\\d+) found in ${rel}`);
    errors++;
  }
}

console.log('Checking reviewer/src/ files...');
walkJs(join(ROOT, 'reviewer', 'src'), path => check(path, true));

console.log('Checking tests/ files...');
walkJs(join(ROOT, 'tests'), path => check(path, false));

console.log(`\nChecked ${checked} files. Errors: ${errors}`);
if (errors > 0) {
  process.exit(1);
} else {
  console.log('Lint passed.');
  process.exit(0);
}
