// tests/unit/scratch.test.js
// Unit tests for scratch.js
// Guardrails covered: G28 (scratch directory isolation), G29 (no AGENTS.md or .env)

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createScratch, checkForbiddenPaths, wouldBeForbidden } from '../../reviewer/src/scratch.js';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const created = [];

after(() => {
  for (const dir of created) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

describe('scratch.js (G28, G29)', () => {
  it('G28: scratch directory is created', () => {
    const dir = createScratch();
    created.push(dir);
    assert.ok(existsSync(dir));
  });

  it('G28: scratch dir contains .bob/custom_modes.yaml', () => {
    const dir = createScratch();
    created.push(dir);
    assert.ok(existsSync(join(dir, '.bob', 'custom_modes.yaml')));
  });

  it('G29: scratch dir does NOT contain AGENTS.md', () => {
    const dir = createScratch();
    created.push(dir);
    assert.ok(!existsSync(join(dir, 'AGENTS.md')));
  });

  it('G29: scratch dir does NOT contain .env', () => {
    const dir = createScratch();
    created.push(dir);
    assert.ok(!existsSync(join(dir, '.env')));
  });

  it('G29: scratch dir does NOT contain .bob/settings.json', () => {
    const dir = createScratch();
    created.push(dir);
    assert.ok(!existsSync(join(dir, '.bob', 'settings.json')));
  });

  it('G28: checkForbiddenPaths throws if AGENTS.md is planted', () => {
    const dir = createScratch();
    created.push(dir);
    writeFileSync(join(dir, 'AGENTS.md'), 'injected', 'utf8');
    assert.throws(() => checkForbiddenPaths(dir), { message: /AGENTS\.md/i });
  });

  it('G29: checkForbiddenPaths throws if .env is planted', () => {
    const dir = createScratch();
    created.push(dir);
    writeFileSync(join(dir, '.env'), 'SECRET=value', 'utf8');
    assert.throws(() => checkForbiddenPaths(dir), { message: /\.env/i });
  });

  it('G28: checkForbiddenPaths throws if .bob/settings.json is planted', () => {
    const dir = createScratch();
    created.push(dir);
    writeFileSync(join(dir, '.bob', 'settings.json'), '{}', 'utf8');
    assert.throws(() => checkForbiddenPaths(dir));
  });

  it('G28: wouldBeForbidden returns true for AGENTS.md', () => {
    assert.equal(wouldBeForbidden('AGENTS.md'), true);
  });

  it('G28: wouldBeForbidden returns true for nested AGENTS.md', () => {
    assert.equal(wouldBeForbidden('subdir/AGENTS.md'), true);
  });

  it('G28: wouldBeForbidden returns false for normal file', () => {
    assert.equal(wouldBeForbidden('src/main.js'), false);
  });
});
