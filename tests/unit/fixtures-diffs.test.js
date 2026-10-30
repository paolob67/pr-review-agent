// tests/unit/fixtures-diffs.test.js
// Phase 3 fixtures: the manifest matches the files, every expectation names a real changed line,
// and the path gate (G9) treats the docs-only and generated fixtures as the manifest says.
// Offline only; no Bob call.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiffChangedLines } from '../../reviewer/src/validate.js';
import { checkPaths } from '../../reviewer/src/gate.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'diffs');
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));

function changedFiles(diff) {
  return [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(m => m[1]);
}

describe('fixtures-diffs', () => {
  it('manifest lists ten fixtures plus the hostile extra, all with files', () => {
    assert.equal(manifest.fixtures.length, 11);
    for (const f of manifest.fixtures) {
      assert.ok(readFileSync(join(DIR, f.file), 'utf8').length > 0, f.file);
    }
  });

  it('G36: every mustCite line is an added line in the fixture diff', () => {
    for (const f of manifest.fixtures) {
      const mc = f.expect.mustCite;
      if (!mc) continue;
      const lines = parseDiffChangedLines(readFileSync(join(DIR, f.file), 'utf8')).get(mc.file);
      assert.ok(lines, `${f.name}: ${mc.file} not in diff`);
      for (const n of mc.lines) assert.ok(lines.has(n), `${f.name}: ${mc.file}:${n} is not an added line`);
    }
  });

  it('G9: path gate skips exactly the fixtures that expect skipped_gate', () => {
    for (const f of manifest.fixtures) {
      const skipped = checkPaths(changedFiles(readFileSync(join(DIR, f.file), 'utf8'))) !== null;
      assert.equal(skipped, f.expect.outcome === 'skipped_gate', f.name);
    }
  });

  it('fixtures contain no real secret formats (synthetic only)', () => {
    for (const f of manifest.fixtures) {
      const text = readFileSync(join(DIR, f.file), 'utf8');
      assert.ok(!/AKIA[0-9A-Z]{16}/.test(text), f.name);
      assert.ok(!/gh[pousr]_[A-Za-z0-9]{30,}/.test(text), f.name);
      assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text), f.name);
    }
  });
});
