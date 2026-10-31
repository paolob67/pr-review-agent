# Spike Results: Phase 0

Date: 2026-10-30
Bob Shell version probed: 2.0.9 (installed during this phase; started on 1.0.4, upgraded to 2.0.9)
Node.js version: 26.3.1
Platform: macOS arm64, Darwin 27.0.0
API key used: PR Review Agent Inference key (expires 2026-12-30, stored in pr-review-agent.json, gitignored)
Total Bob calls used: approximately 28 of 30 budget
Owner config verified unchanged: trustedFolders.json and settings.json match pre-run baseline.

**Note on version history**: Initial probes (calls 1-16) were run against v1.0.6 before the version
discrepancy was found. After upgrading to v2.0.9, all affected probes were re-run (calls 17-28).
The findings below reflect v2.0.9 throughout. Where v1 behaviour differed materially, it is noted.

---

## Gate decisions

**1. Is read-only enforcement reliable (S2, S5)?**

Yes, reliably, using `--disable-tool-groups edit,execute` on every `bob run` invocation. In v2
there is no trusted-folders-based tool restriction: write and execute tools are available by
default in all directories. The `--disable-tool-groups` flag removes them from the tool set for
that run. With both groups disabled, no file writes or shell commands are possible; the model
correctly reports it has no write tools available. This flag must appear on every `bob run` call
in the job wrapper and must not be configurable from outside.

**Consequence for the plan**: G4 test oracle changes. The correct check is that the tool set
excludes `write_file`, `insert_content`, `apply_diff`, `execute_command`, and equivalents. The
v2 JSON output (`stats.tool_calls`) records how many tool calls were made; a write-attempt test
should verify `tool_calls == 0` (or only read tools) and that no file was created.

**2. Reported usage (S7)?**

`-f json` produces a single JSON line on stdout:
`{"type":"result", "status":"success", "stats":{"session_costs": <float>, "max_cost": <limit>,
"tool_calls": <N>, "duration_ms": <N>, "task_id": "<uuid>"}}`
`stats.session_costs` is the per-run cost figure (unit not documented; treated as Bobcoins, see ADR 0011). This is machine-readable and suitable for the
per-PR cost record. No separate flag or debug mode is needed.

**3. How will the reviewer mode and rules be delivered (S3, S14)?**

Project-level `.bob/custom_modes.yaml` is loaded when `--workspace` points to a directory
containing that file. The reviewer mode YAML is placed in the scratch directory's `.bob/`
subdirectory (created by the job wrapper before calling `bob run`). The `--mode <slug>` flag
selects it. The `roleDefinition` field is the reliable carrier for the system persona (confirmed
by canary test). Custom modes work fully via `--workspace`; no user-level baking is required.

**4. How will the scratch directory be managed to prevent AGENTS.md injection (S4, S14)?**

In v2 the `--workspace` flag controls which directory Bob treats as the project root. AGENTS.md
is loaded from the `--workspace` directory (and its parents). The job wrapper controls this
entirely: it creates a fresh scratch directory, writes only the prepared diff and mode config into
it (no `AGENTS.md`, no `.env`), and passes `--workspace <scratch>` to `bob run`. This is
sufficient to prevent prompt injection via AGENTS.md. The trusted-folders mechanism (`trustedFolders.json`) still exists in v2 but does NOT control tool availability; it is not the relevant control.

---

## S1: Installer, version pinning, checksum

**Question**: Does `curl bob.ibm.com/download/bobshell.sh | bash` work non-interactively in a
Linux container, where does it install, how is it pinned to a version, is a checksum published?

**Command**: `curl -fsSL https://bob.ibm.com/download/bobshell.sh` (view only, not piped to shell)

**Observed**:
- The installer is a bash script hosted at `https://bob.ibm.com/download/bobshell.sh`.
- It requires Node.js 22.15.0 or later; exits with error if not found.
- It auto-detects available package managers (npm, pnpm, yarn). It prompts interactively if
  `--pm` is not given. For non-interactive (container) use: `--pm npm --version X.Y.Z`.
- It fetches the latest version from the public npm registry:
  `https://registry.npmjs.org/@ibm/bob/latest` unless `--version X.Y.Z` is passed.
- The package is installed globally as `@ibm/bob@<version>` via the chosen package manager.
  The installed binary is `bobshell` (npm package name) at `/usr/local/bin/bob` (symlink to
  `/usr/local/lib/node_modules/bobshell/bundle/bob.js`).
- **No checksum published in the script.** The npm registry provides its own integrity check
  (the package manager verifies integrity from the registry manifest), but there is no separate
  SHA/hash file provided by IBM for the installer itself.
- Version pinning: supported via `--version X.Y.Z` flag to the installer script. The bob binary
  also supports `--version X.Y.Z` via npm global install directly:
  `npm install --reg=https://registry.npmjs.org/ -g @ibm/bob@X.Y.Z`
- Auto-update observed: version changed from 1.0.4 to 1.0.6 during the probe session (Bob may
  auto-update itself between runs).

**Conclusion**: Dockerfile should use `curl -fsSL https://bob.ibm.com/download/bobshell.sh | bash -s -- --pm npm --version X.Y.Z` with a pinned version. Container install is tested in Phase 4 with podman (docker absent locally). Auto-update must be disabled or accounted for; pinning to an explicit version at install time is the safeguard.

**Consequence for plan**: The Dockerfile uses `--version` to pin. No checksum file to verify; npm
registry integrity is the available mechanism. Document this limitation in the article (G22).

---

## S2: Non-interactive flags and output format

**Question**: Exact flags for read-only operation, tool allow/deny, and machine-readable output?

**Commands**: `bob run --help`, `bob --help`, probes with `-f json` and `-f stream-json`.

**Observed** (v2.0.9):

The non-interactive command is `bob run [prompt...]` (not the root `bob` command).

Key flags:
- `-f / --format [pretty|json|stream-json]`: output format (default: pretty)
  - `json`: single JSON line per run on stdout (result object only)
  - `stream-json`: one JSON line per event (message, tool_use, tool_result, result)
- `--mode <slug>`: select mode by slug (built-in or custom)
- `--workspace <path>`: set the working directory (controls AGENTS.md loading, file access scope)
- `--max-cost <number>`: maximum cost limit (unit not documented); run continues if exceeded but `max_cost` field records the limit
- `--max-turns <number>`: turn limit (0 = unlimited)
- `--disable-mcp`: disable MCP server initialization
- `--disable-subagents`: disable subagent spawning
- `--disable-tool-groups <groups>`: comma-separated list of tool groups to disable
  (e.g. `edit,execute` removes write and shell tools)
- `--trust`: mark current folder as trusted (writes trustedFolders.json)
- `--team-id <id>`: required only for general-scoped API keys
- `--log-level <level>`: log verbosity (default: warn; use `--log-level silent` in CI)

Flags removed in v2 (v1 only): `--yolo`, `--approval-mode`, `--allowed-tools`,
`--allowed-mcp-server-names`, `--sandbox`, `-o/--output-format`, `--hide-intermediary-output`,
`--max-coins`, `--include-directories`, `--chat-mode`.

**JSON output structure** (`-f json`):
```json
{
  "type": "result",
  "timestamp": "<ISO>",
  "status": "success",
  "stats": {
    "task_id": "<uuid>",
    "duration_ms": N,
    "session_costs": N,
    "max_cost": N,
    "tool_calls": N
  },
  "last_message": "<final text response>"
}
```

**stream-json events**: `message` (role/content), `tool_use`, `tool_result`, `result`.

**Conclusion**: `bob run -f json` produces a single parseable JSON line. `stats.session_costs`
is the per-run cost figure (Bobcoins per ADR 0011, unverified). The job wrapper uses `bob run --workspace <scratch> --mode reviewer
--disable-tool-groups edit,execute --disable-mcp -f json [prompt...]`.

**Consequence for plan**: Output contract confirmed. Parser reads the single JSON line from
stdout. `--max-cost` provides a soft budget record; combine with an external timeout wrapper for
wall-clock limits.

---

## S3: Custom mode delivery in non-interactive mode

**Question**: Can a custom mode be selected non-interactively, and from a repo-local or
image-baked file?

**Commands**: `bob run --mode spike-reviewer --workspace <scratch> -f json`

**Observed** (v2.0.9):
- `--mode <slug>` selects a mode non-interactively. The flag is always accepted.
- Project-level `.bob/custom_modes.yaml` in the `--workspace` directory is loaded regardless of
  trusted-folders status. This is a v2 change: trust no longer gates project config loading;
  the `--workspace` flag defines the project boundary.
- `roleDefinition` in the mode YAML is reliably injected into the system context (SPIKE-MODE-ACTIVE
  canary confirmed present in response when placed in `roleDefinition`).
- `customInstructions` were not confirmed separately (canary was placed in `roleDefinition`).
- Mode precedence (v2, from docs and confirmed):
  1. `--mode` flag selects the slug
  2. `<workspace>/.bob/custom_modes.yaml`
  3. `~/.bob/settings/custom_modes.yaml`
  4. Default modes

**Conclusion**: The reviewer mode YAML is written into the scratch directory's `.bob/` folder by
the job wrapper before calling `bob run`. No image baking of mode files is required. The
`--mode reviewer` flag selects it.

**Consequence for plan**: Job wrapper creates `<scratch>/.bob/custom_modes.yaml` containing the
reviewer mode definition before each run. No Dockerfile change needed for mode delivery.

---

## S4: Trusted folder behaviour (non-interactive)

**Question**: How do trusted folders behave non-interactively?

**Commands**: See scripts/spikes/s4-s14-trusted-folders.sh. Re-probed in v2.

**Observed** (v2.0.9):
- `~/.bob/trustedFolders.json` format unchanged: `{ "<absolute-path>": "TRUST_FOLDER" }`.
- **Trusted folders no longer control tool availability in v2.** Write and execute tools are
  available from all directories regardless of trust status. The `--disable-tool-groups` flag
  is the v2 mechanism for tool restriction (see S2, S5).
- `--trust` flag: marks the current folder as trusted (writes trustedFolders.json). Not used
  in the job; the flag is not needed.
- Trusted-folders entries continue to affect project-config loading (`.bob/settings.json` from a
  project is ignored when that folder is untrusted). In v2, the `--workspace` flag supersedes
  this for the purposes of this project.

**Consequence for plan**: G29 updated. `trustedFolders.json` manipulation is not needed in the
container. Read-only enforcement is via `--disable-tool-groups edit,execute`. AGENTS.md
prevention is via `--workspace` pointing to a clean scratch dir (see S14).

---

## S5: Disallowed-tool behaviour in non-interactive mode

**Question**: What happens when the model tries a write tool that has been disabled?

**Commands**: `bob run --disable-tool-groups edit,execute` write-file probe; without the flag.

**Observed** (v2.0.9):
- Without `--disable-tool-groups`: write tools are present and functional everywhere. A file
  creation request succeeds, file is created, `stats.tool_calls` is non-zero. Exit code 0.
- With `--disable-tool-groups edit,execute`: write tools absent from tool set. Model correctly
  reports it cannot create files. File not created. `stats.tool_calls` is 0. Exit code 0.
- There is no error or non-zero exit code when tools are blocked; the model adapts gracefully.
- Test oracle: `stats.tool_calls == 0` AND no file created on disk.

**Consequence for plan**: G4 test oracle updated. `--disable-tool-groups edit,execute` is the
mandatory flag. The exit code alone does not detect write attempts; check tool_calls and disk.

---

## S6: Exit codes and error output

**Question**: Exit codes for auth failure, empty prompt, budget exceeded?

**Commands**: See scripts/spikes/s6-s7-errors-usage.sh.

**Observed** (v2.0.9):
1. **Invalid API key**: exit code 1. Plain text to **stderr**: `Error: Request Failed. Invalid or expired API key.`
2. **Conflicting env vars** (both `BOBSHELL_API_KEY` and `BOB_API_KEY` set with different values):
   exit code 1. Stderr: `Error: BOBSHELL_API_KEY and BOB_API_KEY are both set but have different values. Unset BOBSHELL_API_KEY and use BOB_API_KEY going forward.`
3. **No prompt**: exit code 1. Stderr: `Error: Invalid --prompt: Too small: expected string to have >=1 characters`
4. **`--max-cost` exceeded**: exit code 0. Run completes; `status` field is `"success"`; `max_cost` and `session_costs` are both in the stats. No distinct exit code for budget overrun.
5. **API key env var**: canonical name is `BOB_API_KEY`. v2 reads `BOBSHELL_API_KEY` for backwards compat and copies it to `BOB_API_KEY`, but errors if both are set with different values. Container must set only `BOB_API_KEY`.

**Conclusion**: Exit code 1 = auth failure, config error, or empty prompt. Error messages go to
stderr as plain text (not JSON). `-f json` stdout only written on successful runs (exit 0).
Callers must read stderr separately.

**Consequence for plan**: Wrapper: if `bob run` exits non-zero, read stderr, log and fail. The
container secret name is `bob-creds`; it sets `BOB_API_KEY`. Do not set `BOBSHELL_API_KEY`.

---

## S7: Token and cost reporting

**Question**: Does a non-interactive run report usage anywhere?

**Commands**: `bob run -f json` on multiple runs.

**Observed** (v2.0.9):
- `-f json` outputs a single JSON line per run containing `stats.session_costs` (float).
  Present on every successful run (exit 0). No token-count breakdown (unlike v1).
- `-f stream-json` streams per-message events; final `result` event contains the same stats.
- No separate debug flag or local state file observed.

**Sample costs** (v2):
| Prompt type | session_costs (reported, unit per ADR 0011) |
|-------------|---------------------|
| Simple math | ~0.052-0.072 |
| Write-attempt probe | ~0.159 |
| AGENTS.md canary | ~0.045 |
| Custom mode canary | ~0.118 |
| Stdin 200KB | ~0.186 |

**Conclusion**: `stats.session_costs` is the per-run cost figure. Used directly in the
per-PR cost record. No Bobcoin counter in v2 output.

**Consequence for plan**: G14 and G37 addressed. Per-PR cost is recorded as reported Bobcoins.

---

## S8: File referencing and large stdin

**Question**: Can Bob read files outside the workspace? Can stdin carry a large prompt?

**Commands**: See scripts/spikes/s8-file-stdin.sh.

**Observed** (v2.0.9):
1. **File outside `--workspace`**: Denied at tool level. Model reports the file is outside the
   workspace and offers alternatives. Exit code 0. A setting "Allow outside workspace tool
   requests" exists but must never be enabled in the reviewer container.
2. **stdin as prompt**: Confirmed working. Content piped to stdin is prepended to the prompt.
3. **Large stdin (~200KB)**: Accepted. `session_costs` ~0.186. Model returned an approximation.
   No error or truncation message.

**Conclusion**: PR diff must be delivered via stdin. `--workspace` defines the file access
boundary. Large diffs (up to context window) are accepted via stdin.

**Consequence for plan**: Wrapper pipes `<system-prompt>\n\n<diff>` to stdin. The scratch dir
contains only `.bob/custom_modes.yaml`. No other files needed.

---

## S9: System dependencies

**Question**: Which system packages does Bob need on a slim Linux base image beyond Node?

**Source**: Installer script and docs system requirements section (v2).

**Observed**:
- v2 docs: Node.js 22 or later required. Live install page says "Version 24 or later" for full
  feature set, but npm engine field says `>=22`. Use Node 22 LTS minimum; Node 24 LTS preferred.
- No native packages explicitly listed. The installer uses npm.
- v2 package installs `@ibm/bob` (not `bobshell`). Binary at `dist/bob.js`.

**Conclusion**: Dockerfile base image: `node:22-slim` minimum, `node:24-slim` preferred. Verify
in Phase 4.

**Consequence for plan**: Updated from `node:22.15-slim` to `node:22-slim` (or `node:24-slim`).

---

## S10: Rate and concurrency limits

**Question**: Documented rate and concurrency limits on one API key.

**Source**: Bob docs (no explicit documentation found in either v1 or v2 docs).

**Observed**: No rate-limit or concurrency documentation found. No `--max-coins` in v2 (removed).
Budget is managed via `--max-cost` per run.

**Conclusion**: Unresolved. Assume one-at-a-time; verify empirically in Phase 3.

**Consequence for plan**: S10 remains open. One-at-a-time processing assumed in Phase 2.

---

## S13: Service region and data residency

**Question**: Which Bob service region applies, and can the compute environment (a GitHub-hosted runner per ADR 0001) reach it?

**Source**: Bob docs (no region documentation found in v1 or v2 docs).

**Observed**: No documentation on Bob service regions or data residency found. The v2 source
bundle references a gateway URL (`BOB_GATEWAY_URL` env var overrides it). Owner should check
the Bob web portal for the instance region.

**Conclusion**: Unresolved. Owner to check portal. Article states "unverified".

**Consequence for plan**: S13 remains open. Residency unverified.

---

## S14: Settings format, AGENTS.md loading, .env loading, tool approvals (v2)

**Question**: Which settings control AGENTS.md loading, MCP, and tool approval in v2?

**Commands**: Canary probes with `--workspace` pointing to dirs with and without AGENTS.md.

**Observed** (v2.0.9):
- **AGENTS.md loading**: fully controlled by `--workspace`. AGENTS.md is loaded from the
  `--workspace` directory (and parents). A clean scratch dir with no AGENTS.md = no injection.
  Confirmed by canary: CANARY-SEVEN present when `--workspace` points to dir with AGENTS.md,
  absent when `--workspace` points to clean dir.
- **`bob-cline.useAgentRules`**: v1/IDE setting only. Not present in v2 Shell settings schema.
  Do not use.
- **v2 settings schema**: `session.*`, `logging.*`, `tasks.*`, `telemetry.*`. No
  `useAgentRules` or approval-mode equivalent in the user settings file.
- **MCP**: disabled per run with `--disable-mcp` flag. No settings key needed.
- **`.env` file**: not loaded by `bob run` (confirmed: no env leakage in probes).
- **v2 settings files**: user settings at `~/.bob/settings/settings.json`. Project settings
  at `<workspace>/.bob/`. The old `~/.bob/settings.json` is a v1 file; v2 reads
  `~/.bob/settings/settings.json`.

**Conclusion** (v2):
- AGENTS.md: use `--workspace <clean-scratch>`. No settings key needed.
- MCP: `--disable-mcp` per run.
- Write/execute: `--disable-tool-groups edit,execute` per run.
- No `.env` loading.
- The complete v2 bob run command: `bob run --workspace <scratch> --mode reviewer
  --disable-tool-groups edit,execute --disable-mcp -f json <prompt>`

**Consequence for plan**: G28, G29, G30 significantly simplified. No image settings.json
manipulation needed. The wrapper command above is the security control.
