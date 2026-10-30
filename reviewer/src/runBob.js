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

// buildBobEnv constructs the scrubbed environment for the Bob process. (G3)
// parentEnv defaults to process.env.
// FAKE_BOB_* env vars are passed through to support the test fake-bob shim.
// They are harmless to real Bob (which ignores unknown vars) and are never set
// in production environments.
export function buildBobEnv(parentEnv = process.env) {
  const env = {};
  for (const key of ALLOWED_ENV_VARS) {
    if (parentEnv[key] !== undefined) {
      env[key] = parentEnv[key];
    }
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
export function runBob({ bobBin, scratchDir, promptText, timeoutSeconds, parentEnv }) {
  const env = buildBobEnv(parentEnv ?? process.env);

  const args = [
    'run',
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
export function getBobVersion({ bobBin, parentEnv, timeoutSeconds = 15 }) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(bobBin, ['--version'], {
        env: buildBobEnv(parentEnv ?? process.env),
        stdio: ['ignore', 'pipe', 'ignore'],
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
