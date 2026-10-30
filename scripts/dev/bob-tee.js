#!/usr/bin/env node
// scripts/dev/bob-tee.js
// Dev-only shim used as REVIEW_BOB_BIN by scripts/dev/review-local.js.
// Runs the real Bob (or fake-bob) with the same argv and the same scrubbed environment it was given,
// and records stdin, stdout, stderr and exit code. The reviewer's env allowlist does not pass custom
// variables, so the configuration travels through /tmp/bob-tee-config.json (the scrubbed env has no TMPDIR). Never used in production.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const cfg = JSON.parse(readFileSync('/tmp/bob-tee-config.json', 'utf8'));
const args = process.argv.slice(2);

if (args.includes('--version')) {
  const v = spawn(cfg.bin, args, { stdio: ['ignore', 'inherit', 'ignore'] });
  v.on('close', c => process.exit(c ?? 0));
} else {
  mkdirSync(cfg.outDir, { recursive: true });
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    const input = Buffer.concat(chunks);
    writeFileSync(join(cfg.outDir, 'bob-stdin.txt'), input);
    writeFileSync(join(cfg.outDir, 'bob-argv.json'), JSON.stringify(args));
    const child = spawn(cfg.bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', c => { out += c; });
    child.stderr.on('data', c => { err += c; });
    child.stdin.end(input);
    child.on('close', code => {
      writeFileSync(join(cfg.outDir, 'bob-stdout.txt'), out);
      writeFileSync(join(cfg.outDir, 'bob-stderr.txt'), err);
      writeFileSync(join(cfg.outDir, 'bob-exit.txt'), String(code));
      process.stdout.write(out);
      process.stderr.write(err);
      process.exit(code ?? 0);
    });
  });
}
