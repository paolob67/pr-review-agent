// runBob.js
// Guardrails: G2 (separate credentials per stage), G3 (scrubbed env for Bob process),
//             G13 (hard timeout on Bob process)
// Spawns the Bob binary with a scrubbed environment and enforces a timeout.
// The canary variable CANARY_BOB_MUST_NOT_APPEAR must never appear in the child env.
// SCM tokens are explicitly excluded from the child env.
// No runtime dependencies.

import { spawn } from 'node:child_process';

// ALLOWED_ENV_VARS: only these keys from the parent env are passed to Bob.
// SCM_READ_TOKEN and SCM_COMMENT_TOKEN are intentionally absent. (G2, G3)
const ALLOWED_ENV_VARS = new Set(['BOB_API_KEY', 'PATH', 'HOME', 'NODE_ENV']);

// bobUserFromEnv reads the optional unprivileged Bob identity (S11, G23). Returns null when unset
// (local runs and offline tests), otherwise { uid, gid, home }. Values come from the image, never
// from the caller.
export function bobUserFromEnv(env = process.env) {
  const uid = parseInt(env.REVIEW_BOB_UID ?? '', 10);
  const gid = parseInt(env.REVIEW_BOB_GID ?? '', 10);
  if (!Number.isInteger(uid) || !Number.isInteger(gid) || uid <= 0 || gid <= 0) return null;
  return { uid, gid, home: env.REVIEW_BOB_HOME || '/home/bobrun' };
}

// buildBobEnv constructs the scrubbed environment for the Bob process. (G3)
// parentEnv defaults to process.env. When bobUser is given, HOME is that user's home, never the
// wrapper's.
// FAKE_BOB_* env vars are passed through to support the test fake-bob shim.
// They are harmless to real Bob (which ignores unknown vars) and are never set
// in production environments.
export function buildBobEnv(parentEnv = process.env, bobUser = null) {
  const env = {};
  for (const key of ALLOWED_ENV_VARS) {
    if (parentEnv[key] !== undefined) {
      env[key] = parentEnv[key];
    }
  }
  if (bobUser) {
    env.HOME = bobUser.home;
  }
  // Pass through FAKE_BOB_* env vars for the test shim (no-op in production).
  for (const [key, value] of Object.entries(parentEnv)) {
    if (key.startsWith('FAKE_BOB_')) {
      env[key] = value;
    }
  }
  // Verify the canary variable is never present. (G3)
  if (env['CANARY_BOB_MUST_NOT_APPEAR'] !== undefined) {
    throw new Error('CANARY_BOB_MUST_NOT_APPEAR found in Bob env: isolation violated');
  }
  return env;
}

// runBob spawns the Bob binary and returns { stdout, stderr, exitCode, durationMs }. (G13)
//
// Parameters:
//   bobBin        - path or name of the Bob executable (REVIEW_BOB_BIN env var)
//   scratchDir    - path to the scratch directory passed as --workspace
//   promptText    - text to pipe to stdin
//   timeoutSeconds - hard kill timeout
//   parentEnv     - parent environment to scrub (defaults to process.env)
//   bobUser       - optional { uid, gid, home }: run Bob as that unprivileged user (S11, G23)
export function runBob({ bobBin, scratchDir, promptText, timeoutSeconds, parentEnv, bobUser = null }) {
  const env = buildBobEnv(parentEnv ?? process.env, bobUser);

  const args = [
    'run',
    // ADR 0013: the owner accepted the IBM Bob license for this project; non-interactive runs
    // cannot accept it any other way.
    '--accept-license',
    '--workspace', scratchDir,
    '--mode', 'reviewer',
    '--disable-tool-groups', 'edit,execute',
    '--disable-mcp',
    '-f', 'json',
    '--log-level', 'silent',
  ];

  return new Promise((resolve, reject) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(bobBin, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(bobUser ? { uid: bobUser.uid, gid: bobUser.gid, cwd: scratchDir } : {}),
    });

    // Write the prompt to stdin then close it so Bob gets EOF.
    if (promptText) {
      child.stdin.write(promptText, 'utf8');
    }
    child.stdin.end();

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });

    // Hard timeout: kill the process after configured seconds. (G13)
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
    }, timeoutSeconds * 1000);

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      if (timedOut) {
        resolve({ stdout, stderr, exitCode: null, durationMs, timedOut: true });
      } else {
        resolve({ stdout, stderr, exitCode: code ?? 0, durationMs, timedOut: false });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// getBobVersion returns the version string from `bob --version` (first line), or null. (G37)
// Uses the same scrubbed environment as the review run. Never throws; null on any problem.
export function getBobVersion({ bobBin, parentEnv, timeoutSeconds = 15, bobUser = null }) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(bobBin, ['--version'], {
        env: buildBobEnv(parentEnv ?? process.env, bobUser),
        stdio: ['ignore', 'pipe', 'ignore'],
        ...(bobUser ? { uid: bobUser.uid, gid: bobUser.gid, cwd: bobUser.home } : {}),
      });
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutSeconds * 1000);
    child.stdout.on('data', c => { out += c.toString(); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', () => {
      clearTimeout(timer);
      const first = out.split('\n')[0].trim();
      resolve(/^\d+\.\d+\.\d+[\w.+-]*$/.test(first) ? first : null);
    });
  });
}

export default runBob;
