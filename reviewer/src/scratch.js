// scratch.js
// Guardrails: G28 (scratch directory contains only prepared data), G29 (no AGENTS.md or .env)
// Creates a fresh temp directory and writes the reviewer mode config into it.
// Verifies no forbidden files (AGENTS.md, .env*, .bob/settings.json) are present.
// No runtime dependencies.

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, statSync, chownSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODE_SRC = join(__dirname, '..', 'modes', 'reviewer-mode.yaml');

// Patterns for forbidden paths in the scratch directory. (G28, G29)
const FORBIDDEN_PATTERNS = [
  /(?:^|\/)AGENTS\.md$/i,
  /(?:^|\/)\.env(?:$|\.)/,
  /(?:^|\/)\.bob\/settings\.json$/i,
  /(?:^|\/)\.bob\/settings\//i,
];

function isForbidden(relativePath) {
  return FORBIDDEN_PATTERNS.some(re => re.test(relativePath));
}

// walkForbidden checks all files under dir for forbidden path patterns.
// Returns an array of forbidden relative paths found.
function walkForbidden(dir, base) {
  base = base ?? dir;
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = full.slice(base.length + 1);
    if (isForbidden(rel)) {
      found.push(rel);
    }
    try {
      if (statSync(full).isDirectory()) {
        found.push(...walkForbidden(full, base));
      }
    } catch {
      // ignore stat errors
    }
  }
  return found;
}

// createScratch creates a temp directory, writes .bob/custom_modes.yaml,
// and verifies no forbidden files are present. (G28, G29)
// Returns the path to the scratch directory.
export function createScratch() {
  const scratchDir = mkdtempSync(join(tmpdir(), 'pr-review-'));
  const bobDir = join(scratchDir, '.bob');
  mkdirSync(bobDir, { recursive: true });

  // Write the reviewer mode YAML so Bob can find it via --workspace.
  const modeYaml = readFileSync(MODE_SRC, 'utf8');
  writeFileSync(join(bobDir, 'custom_modes.yaml'), modeYaml, 'utf8');

  // Verify no forbidden paths exist under scratch.
  checkForbiddenPaths(scratchDir);

  return scratchDir;
}

// checkForbiddenPaths throws if any forbidden file is present under scratchDir. (G28, G29)
export function checkForbiddenPaths(scratchDir) {
  const found = walkForbidden(scratchDir, scratchDir);
  if (found.length > 0) {
    throw new Error(`Forbidden paths found in scratch directory: ${found.join(', ')}`);
  }
}

// handOverScratch gives the scratch tree to the unprivileged Bob user so Bob can read it. (S11, G23)
// Only called when the wrapper runs as root; the tree holds nothing but wrapper-generated files.
export function handOverScratch(scratchDir, uid, gid) {
  const walk = (p) => {
    chownSync(p, uid, gid);
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) walk(join(p, e));
    }
  };
  walk(scratchDir);
}

// seedBobHome prepares Bob's home on a writable (tmpfs) mount: creates <home>/.bob/settings, copies
// the root-owned default settings file into it and hands the tree to the Bob user. Bob writes under
// ~/.bob at start, and the container rootfs is read-only (G23), so the home is a tmpfs seeded here.
// The settings file turns off auto-update and AGENTS.md loading (G30). Only called when the wrapper
// runs as root with a Bob user. No-op when the seed file is absent (local runs, offline tests).
export function seedBobHome(home, uid, gid, seedFile) {
  if (!existsSync(seedFile)) return;
  const settingsDir = join(home, '.bob', 'settings');
  mkdirSync(settingsDir, { recursive: true });
  writeFileSync(join(settingsDir, 'settings.json'), readFileSync(seedFile));
  const walk = (p) => {
    chownSync(p, uid, gid);
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) walk(join(p, e));
    }
  };
  walk(home);
}

// assertNoBobSettingsJson is exported for tests that verify a specific forbidden path.
export function wouldBeForbidden(relativePath) {
  return isForbidden(relativePath);
}

export default createScratch;
