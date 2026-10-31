// gate.js
// Guardrails: G7 (author policy), G8 (size gates), G9 (skip rules),
//             G14 (budget caps), G31 (CI gate - evaluated by trigger; head checked here),
//             G32 (head pinning)
// Gate functions that decide whether the review should proceed.
// Each returns null (proceed) or a { outcome, reason } object (skip).
// No runtime dependencies.

// Paths / extensions that are always skipped when ALL changed files fall into these categories.
// (G9)
const IGNORED_EXTENSIONS = new Set(['.lock', '.sum']);
const IGNORED_FILENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'go.sum', 'pnpm-lock.yaml',
  'Gemfile.lock', 'poetry.lock', 'Cargo.lock', 'composer.lock',
]);
const IGNORED_NAME_SUFFIXES = ['-lock.yaml'];
const IGNORED_DOC_EXTENSIONS = new Set(['.md', '.txt', '.rst', '.mdx']);
const IGNORED_DIST_PREFIXES = ['dist/', 'build/', 'vendor/', 'node_modules/'];
const IGNORED_FILE_SUFFIXES = ['.min.js', '.min.css', '.d.ts'];

function isIgnoredPath(filePath) {
  const lower = filePath.toLowerCase();
  const filename = lower.split('/').pop();

  if (IGNORED_FILENAMES.has(filename)) return true;
  for (const suffix of IGNORED_NAME_SUFFIXES) {
    if (filename.endsWith(suffix)) return true;
  }
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex >= 0) {
    const ext = filename.slice(dotIndex);
    if (IGNORED_EXTENSIONS.has(ext)) return true;
    if (IGNORED_DOC_EXTENSIONS.has(ext)) return true;
  }
  for (const prefix of IGNORED_DIST_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  for (const suffix of IGNORED_FILE_SUFFIXES) {
    if (lower.endsWith(suffix)) return true;
  }
  return false;
}

// checkHeadPin verifies the PR is still open and the head SHA matches. (G32)
// Returns 'skipped_stale' outcome object if the PR is stale; null otherwise.
export function checkHeadPin(pr, headSha) {
  if (pr.state !== 'open') {
    return { outcome: 'skipped_stale', reason: 'pr_closed' };
  }
  if (pr.head?.sha !== headSha) {
    return { outcome: 'skipped_stale', reason: 'head_moved' };
  }
  return null;
}

// checkAuthor checks the PR author association. (G7)
// Returns skipped_gate if the author is not in the allowed set and no maintainer has applied the
// review label (ADR 0015). Only users with triage rights or above can label a pull request, so the
// label is the maintainer override for outside contributors.
const ALLOWED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
export const REVIEW_LABEL = 'ai-review';

export function checkAuthor(pr) {
  if (Array.isArray(pr.labels) && pr.labels.some(l => l?.name === REVIEW_LABEL)) return null;
  const assoc = pr.author_association ?? '';
  if (!ALLOWED_ASSOCIATIONS.has(assoc)) {
    return { outcome: 'skipped_gate', reason: 'author_policy' };
  }
  return null;
}

// checkDraft returns skipped_gate if the PR is a draft. (G9)
export function checkDraft(pr) {
  if (pr.draft === true) {
    return { outcome: 'skipped_gate', reason: 'draft' };
  }
  return null;
}

// checkSizes returns skipped_gate if file count or diff bytes exceed configured limits. (G8)
export function checkSizes(fileCount, diffBytes, config) {
  if (fileCount > config.maxFiles) {
    return { outcome: 'skipped_gate', reason: 'size_exceeded', detail: `file_count=${fileCount} limit=${config.maxFiles}` };
  }
  if (diffBytes > config.maxDiffBytes) {
    return { outcome: 'skipped_gate', reason: 'size_exceeded', detail: `diff_bytes=${diffBytes} limit=${config.maxDiffBytes}` };
  }
  return null;
}

// checkPaths returns skipped_gate if ALL changed files are lockfiles, generated, or docs-only. (G9)
export function checkPaths(files) {
  if (!files || files.length === 0) return null;
  const allIgnored = files.every(f => isIgnoredPath(typeof f === 'string' ? f : f.filename ?? ''));
  if (allIgnored) {
    return { outcome: 'skipped_gate', reason: 'ignored_paths' };
  }
  return null;
}

// checkBudget enforces the per-PR run cap. (G14)
// runs: number of previous runs for this PR (from the marker comment)
// config: { maxRunsPerPR }
// Daily run and spend caps are not implemented on purpose (ADR 0009): the job is stateless.
export function checkBudget(runs, config) {
  if (runs >= config.maxRunsPerPR) {
    return { outcome: 'skipped_gate', reason: 'pr_run_limit_reached', detail: `runs=${runs} limit=${config.maxRunsPerPR}` };
  }
  return null;
}
