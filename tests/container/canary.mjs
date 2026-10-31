#!/usr/bin/env node
// tests/container/canary.mjs
// S11 / G23 canary test, run INSIDE the container (locally under podman, or on a GitHub-hosted
// runner with the command overridden). The wrapper side holds canary SCM tokens; a probe is started the way
// the reviewer starts Bob (reviewer/src/runBob.js, scratch handed over by scratch.js). The probe
// reports what it can see; this script asserts that none of the wrapper's secrets are reachable.
//
// Prints one JSON verdict line. Exit 0 = pass, 1 = fail. No secret value is ever printed: the
// canary tokens are made-up strings, and only variable NAMES and booleans are reported.
import { runBob, bobUserFromEnv } from '../../reviewer/src/runBob.js';
import { createScratch, handOverScratch } from '../../reviewer/src/scratch.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rmSync, chmodSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const probe = join(here, 'probe-bob.mjs');
// The image sets the executable bit; chmod only helps local runs, and fails on a read-only rootfs.
try { chmodSync(probe, 0o755); } catch { /* read-only rootfs: rely on the image */ }

// Canary values replace whatever the job had; the real secrets are never used by this test.
const parentEnv = {
  ...process.env,
  BOB_API_KEY: 'canary-bob-key-0000',
  SCM_READ_TOKEN: 'canary-scm-read-0000',
  SCM_COMMENT_TOKEN: 'canary-scm-comment-0000',
  CANARY_BOB_MUST_NOT_APPEAR: 'canary-must-not-appear',
};

const bobUser = bobUserFromEnv(process.env);
const checks = [];
const check = (name, ok, detail = null) => checks.push({ name, ok: !!ok, ...(detail ? { detail } : {}) });

if (!bobUser) {
  check('bob identity configured (REVIEW_BOB_UID / REVIEW_BOB_GID)', false, 'unset or invalid');
  finish(null);
}
check('wrapper starts as root so it can drop to the Bob uid', process.getuid() === 0, `wrapper uid ${process.getuid()}`);

const scratch = createScratch();
let result = null;
try {
  handOverScratch(scratch, bobUser.uid, bobUser.gid);
  const r = await runBob({ bobBin: probe, scratchDir: scratch, promptText: 'canary', timeoutSeconds: 30, parentEnv, bobUser });
  const line = r.stdout.split('\n').find((l) => l.startsWith('{"type":"probe"'));
  result = line ? JSON.parse(line) : null;
  check('probe ran and reported', !!result, `exit ${r.exitCode} stderr bytes ${r.stderr.length}`);
} catch (e) {
  check('probe ran and reported', false, e.code ?? e.message);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (result) {
  const SCM = ['SCM_READ_TOKEN', 'SCM_COMMENT_TOKEN'];
  check('probe runs as the Bob uid, not root', result.uid === bobUser.uid && result.gid === bobUser.gid, `uid ${result.uid}`);
  check('probe has no effective capabilities', /^0+$/.test(result.cap_eff ?? ''), `CapEff ${result.cap_eff}`);
  check('probe env has BOB_API_KEY only as secret', result.own_env_names.includes('BOB_API_KEY') && !SCM.some((n) => result.own_env_names.includes(n)));
  check('probe env lacks the canary variable', !result.own_env_names.includes('CANARY_BOB_MUST_NOT_APPEAR'));
  check('probe cannot read the wrapper environ (/proc/<ppid>/environ)', result.parent_environ.readable === false, JSON.stringify(result.parent_environ.error ?? result.parent_environ.names));
  check('probe cannot read the wrapper memory (/proc/<ppid>/mem)', result.parent_mem_readable === false);
  const leaking = result.readable_environ_with_names.filter((p) => p.names.some((n) => SCM.includes(n)));
  check('no readable process environ contains SCM variable names', leaking.length === 0, leaking.length ? `pids ${leaking.map((p) => p.pid).join(',')}` : null);
  check('probe cannot list /root', result.can_list_root_home === false);
  check('probe cannot write /app (reviewer code)', result.can_write_app === false);
  check('probe cannot write /etc', result.can_write_etc === false);
  check('probe can read its scratch workspace', result.workspace_readable && result.workspace_custom_modes_readable);
  // Informational only (not pass/fail): other facts for the results file.
  result.info = { parent_cmdline_readable: result.parent_cmdline_readable, readable_environ_count: result.readable_environ_with_names.length, cwd: result.cwd };
}
finish(result?.info ?? null);

function finish(info) {
  const pass = checks.every((c) => c.ok);
  process.stdout.write(JSON.stringify({ event: 'canary_verdict', pass, checks, info }) + '\n');
  process.exit(pass ? 0 : 1);
}
