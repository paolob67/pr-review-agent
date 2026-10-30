// prompt.js
// Guardrails: G8 (maxPromptBytes cap enforced before sending to Bob)
// Builds the text piped to Bob's stdin.
// Enforces REVIEW_MAX_PROMPT_BYTES by truncating the diff if needed.
// Loads the system instructions from reviewer/prompts/reviewer-prompt.md.
// No runtime dependencies.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, '..', 'prompts', 'reviewer-prompt.md');

let _promptTemplate = null;
function getPromptTemplate() {
  if (!_promptTemplate) {
    _promptTemplate = readFileSync(PROMPT_PATH, 'utf8');
  }
  return _promptTemplate;
}

// parseDiffFiles extracts filenames from a unified diff for reference in the prompt.
function parseDiffFiles(diff) {
  const files = [];
  const re = /^\+\+\+ b\/(.+)$/gm;
  let m;
  while ((m = re.exec(diff)) !== null) {
    files.push(m[1]);
  }
  return files;
}

// buildPrompt assembles the full prompt string. (maxPromptBytes enforced)
//
// Parameters:
//   diff         - redacted unified diff string
//   rules        - { standards, projectRules, security, config } (may have nulls)
//   meta         - PR metadata: { title, baseBranch, headBranch, authorAssociation }
//   maxBytes     - byte limit for the whole prompt
//
// Returns { prompt, truncated } where truncated is true if diff was cut.
export function buildPrompt({ diff, rules, meta, maxBytes }) {
  const template = getPromptTemplate();

  const rulesSection = buildRulesSection(rules);
  const metaSection  = buildMetaSection(meta, parseDiffFiles(diff));

  // Static parts that cannot be trimmed.
  const staticParts = [
    template,
    '\n\n---\n',
    rulesSection,
    '\n\n---\n',
    metaSection,
    '\n\n[BEGIN PR DATA - UNTRUSTED]\n',
    '\n[END PR DATA]\n',
  ].join('');

  const staticBytes = Buffer.byteLength(staticParts, 'utf8');
  const diffBudget  = maxBytes - staticBytes;

  let finalDiff = diff;
  let truncated = false;

  if (diffBudget <= 0) {
    // Even without any diff we are over the limit; omit diff entirely.
    finalDiff = '[DIFF OMITTED: prompt size limit reached]';
    truncated = true;
  } else {
    const diffBytes = Buffer.byteLength(diff, 'utf8');
    if (diffBytes > diffBudget) {
      // Truncate the diff to fit.
      const truncatedDiff = Buffer.from(diff, 'utf8').slice(0, diffBudget).toString('utf8');
      finalDiff = truncatedDiff + '\n[... DIFF TRUNCATED: prompt size limit reached ...]';
      truncated = true;
      process.stderr.write(`[prompt] diff truncated: ${diffBytes} bytes > ${diffBudget} byte budget\n`);
    }
  }

  const prompt = [
    template,
    '\n\n---\n',
    rulesSection,
    '\n\n---\n',
    metaSection,
    '\n\n[BEGIN PR DATA - UNTRUSTED]\n',
    finalDiff,
    '\n[END PR DATA]\n',
  ].join('');

  return { prompt, truncated };
}

function buildRulesSection(rules) {
  const parts = ['## Coding standards and rules'];
  if (rules.standards) {
    parts.push('\n### Standards (cite rule IDs exactly as shown)\n');
    parts.push(rules.standards);
  } else {
    parts.push('\n_No standards.md found; apply general best practices._');
  }
  if (rules.projectRules) {
    parts.push('\n### Team rules (cite rule IDs exactly as shown)\n');
    parts.push(rules.projectRules);
  } else {
    parts.push('\n_No project-rules.md found._');
  }
  if (rules.security) {
    parts.push('\n### Security focus areas\n');
    parts.push(rules.security);
  }
  return parts.join('\n');
}

function buildMetaSection(meta, diffFiles) {
  return [
    '## PR metadata',
    `- Base branch: ${meta?.baseBranch ?? 'unknown'}`,
    `- Head branch: ${meta?.headBranch ?? 'unknown'}`,
    `- Author association: ${meta?.authorAssociation ?? 'unknown'}`,
    `- Changed files: ${diffFiles.join(', ') || '(none)'}`,
  ].join('\n');
}

export default buildPrompt;
