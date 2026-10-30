#!/usr/bin/env node
// tests/container/probe-bob.mjs
// Stand-in for the Bob process in the S11 / G23 canary test. It runs with the same uid, gid, HOME and
// scrubbed environment as the real Bob process, then reports what an attacker who controlled Bob
// could see. It prints facts and variable NAMES only, never values.
import { readFileSync, readdirSync, writeFileSync, accessSync, constants } from 'node:fs';

function tryRead(path) {
  try { return readFileSync(path); } catch (e) { return { error: e.code ?? 'ERR' }; }
}
function envNames(buf) {
  return buf.toString('utf8').split('\0').filter(Boolean).map((kv) => kv.split('=')[0]);
}
function canWrite(path) {
  try { accessSync(path, constants.W_OK); return true; } catch { return false; }
}
function canWriteFile(path) {
  try { writeFileSync(path, 'x', { flag: 'wx' }); return true; } catch { return false; }
}

const out = {
  uid: process.getuid(), gid: process.getgid(), ppid: process.ppid,
  own_env_names: Object.keys(process.env).sort(),
  cap_eff: (readFileSync('/proc/self/status', 'utf8').match(/^CapEff:\s*(\S+)/m) ?? [])[1] ?? null,
  readable_environ_with_names: [],
  parent_environ: null, parent_cmdline_readable: null, parent_mem_readable: null,
  can_list_root_home: (() => { try { readdirSync('/root'); return true; } catch { return false; } })(),
  can_write_app: canWrite('/app') || canWriteFile('/app/reviewer/pwned'),
  can_write_etc: canWriteFile('/etc/pwned'),
  cwd: process.cwd(),
};

// Parent (the wrapper) must not be inspectable.
const penv = tryRead(`/proc/${process.ppid}/environ`);
out.parent_environ = penv instanceof Buffer ? { readable: true, names: envNames(penv) } : { readable: false, error: penv.error };
const pcmd = tryRead(`/proc/${process.ppid}/cmdline`);
out.parent_cmdline_readable = pcmd instanceof Buffer;
const pmem = tryRead(`/proc/${process.ppid}/mem`);
out.parent_mem_readable = pmem instanceof Buffer;

// Any other process whose environment is readable.
for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
  if (Number(pid) === process.pid) continue;
  const b = tryRead(`/proc/${pid}/environ`);
  if (b instanceof Buffer) out.readable_environ_with_names.push({ pid: Number(pid), names: envNames(b) });
}

// Scratch workspace is reachable and writable by Bob only where intended.
const ws = process.argv[process.argv.indexOf('--workspace') + 1];
out.workspace_readable = (() => { try { readdirSync(ws); return true; } catch { return false; } })();
out.workspace_custom_modes_readable = tryRead(`${ws}/.bob/custom_modes.yaml`) instanceof Buffer;

process.stdout.write(JSON.stringify({ type: 'probe', ...out }) + '\n');
