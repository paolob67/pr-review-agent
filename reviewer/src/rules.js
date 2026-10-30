// rules.js
// Guardrails: G33 (team rules read from base branch through the API, never from PR head)
// Fetches and validates .bob-review/ rule files from the PR base branch.
// Size caps are applied; oversized content is truncated with a warning.
// Rule IDs are extracted from markdown for validation of findings later.
// No runtime dependencies.

const RULE_ID_RE = /\b(STD|TEAM)-\d+\b/g;

// Size limits from CONTRACTS section 3 (also in thresholds.json).
const DEFAULT_SIZE_LIMITS = {
  standards:   32768,
  projectRules: 32768,
  security:    16384,
  config:       4096,
};

function capContent(content, limitBytes, label) {
  if (content === null || content === undefined) return null;
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > limitBytes) {
    process.stderr.write(`[rules] ${label} truncated: ${bytes} bytes > ${limitBytes} byte limit\n`);
    // Truncate to approximate byte limit (utf8 chars may be 1-4 bytes; slice conservatively).
    return content.slice(0, limitBytes);
  }
  return content;
}

function extractRuleIds(text) {
  if (!text) return new Set();
  const ids = new Set();
  let m;
  const re = new RegExp(RULE_ID_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    ids.add(m[0]);
  }
  return ids;
}

// loadRules fetches all four rule files from the base branch through the API. (G33)
// Returns { standards, projectRules, security, config, ruleIds }
//   - Each file field is the file content string, or null if missing.
//   - ruleIds is a Set of strings like "STD-001", "TEAM-004".
// sizeLimits overrides the defaults (used in tests).
export async function loadRules(github, repo, baseBranch, sizeLimits = DEFAULT_SIZE_LIMITS) {
  const [standards, projectRules, security, configRaw] = await Promise.all([
    github.getFileContents(repo, '.bob-review/standards.md', baseBranch),
    github.getFileContents(repo, '.bob-review/project-rules.md', baseBranch),
    github.getFileContents(repo, '.bob-review/security.md', baseBranch),
    github.getFileContents(repo, '.bob-review/config.json', baseBranch),
  ]);

  const cappedStandards   = capContent(standards,   sizeLimits.standards,   'standards.md');
  const cappedProjectRules = capContent(projectRules, sizeLimits.projectRules, 'project-rules.md');
  const cappedSecurity    = capContent(security,    sizeLimits.security,    'security.md');
  const cappedConfig      = capContent(configRaw,   sizeLimits.config,      'config.json');

  const ruleIds = new Set([
    ...extractRuleIds(cappedStandards),
    ...extractRuleIds(cappedProjectRules),
  ]);

  return {
    standards: cappedStandards,
    projectRules: cappedProjectRules,
    security: cappedSecurity,
    config: cappedConfig,
    ruleIds,
  };
}

export default loadRules;
