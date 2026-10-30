// tests/unit/rules.test.js
// Unit tests for rules.js
// Guardrails covered: G33 (base-branch loading, size caps, rule ID extraction)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRules } from '../../reviewer/src/rules.js';

// Minimal mock GitHub client.
function makeClient(files = {}) {
  return {
    async getFileContents(repo, path, ref) {
      return files[path] ?? null;
    },
  };
}

const SAMPLE_STANDARDS = `# Coding Standards

## STD-001: No hardcoded secrets
Never commit API keys or passwords directly in source code.

## STD-002: Use parameterized queries
SQL queries must use parameterized statements.
`;

const SAMPLE_PROJECT_RULES = `# Project Rules

## TEAM-001: No direct DOM manipulation
Use React state instead of direct DOM manipulation.

## TEAM-002: Error boundaries required
All async operations must have error boundaries.
`;

describe('rules.js (G33)', () => {
  it('G33: rule IDs are extracted from standards markdown', async () => {
    const client = makeClient({
      '.bob-review/standards.md': SAMPLE_STANDARDS,
      '.bob-review/project-rules.md': SAMPLE_PROJECT_RULES,
    });
    const rules = await loadRules(client, 'owner/repo', 'main');
    assert.ok(rules.ruleIds.has('STD-001'));
    assert.ok(rules.ruleIds.has('STD-002'));
    assert.ok(rules.ruleIds.has('TEAM-001'));
    assert.ok(rules.ruleIds.has('TEAM-002'));
  });

  it('G33: missing rule file returns null without error', async () => {
    const client = makeClient({});
    const rules = await loadRules(client, 'owner/repo', 'main');
    assert.equal(rules.standards, null);
    assert.equal(rules.projectRules, null);
    assert.equal(rules.security, null);
    assert.equal(rules.config, null);
    assert.equal(rules.ruleIds.size, 0);
  });

  it('G33: oversized standards is truncated to size limit', async () => {
    const bigContent = 'a'.repeat(100000); // 100KB > 32KB limit
    const client = makeClient({ '.bob-review/standards.md': bigContent });
    const rules = await loadRules(client, 'owner/repo', 'main', {
      standards: 32768, projectRules: 32768, security: 16384, config: 4096,
    });
    // Truncated content should be shorter than the original
    assert.ok(rules.standards !== null);
    assert.ok(rules.standards.length < bigContent.length);
  });

  it('G33: security.md and config.json are loaded when present', async () => {
    const client = makeClient({
      '.bob-review/security.md': '# Security focus: XSS',
      '.bob-review/config.json': '{"maxFindings": 10}',
    });
    const rules = await loadRules(client, 'owner/repo', 'main');
    assert.ok(rules.security.includes('XSS'));
    assert.ok(rules.config.includes('maxFindings'));
  });

  it('G33: rule IDs not in ruleIds set when files are absent', async () => {
    const client = makeClient({});
    const rules = await loadRules(client, 'owner/repo', 'main');
    assert.ok(!rules.ruleIds.has('STD-001'));
  });
});
