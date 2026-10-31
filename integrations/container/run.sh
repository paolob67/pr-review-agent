#!/usr/bin/env bash
# Run the reviewer image locally with podman and the same hardening flags the workflow uses
# (ADR 0012, G23): read-only rootfs, all capabilities dropped except those the UID drop needs,
# no-new-privileges, tmpfs scratch. The Bob key is passed by NAME (-e BOB_API_KEY), never by value.
# Usage: run.sh [tag] -- <command and args overriding the entrypoint, optional>
# With no command the image entrypoint (reviewer/bin/reviewer.js) runs.
set -euo pipefail
tag="pr-reviewer:local"
if [ "$#" -gt 0 ] && [ "$1" != "--" ]; then tag="$1"; shift; fi
[ "${1:-}" = "--" ] && shift

# Capabilities kept (found by removal on 2026-10-30, see docs/results/phase-4-container.md):
# CHOWN hands the scratch directory to the Bob uid, SETUID/SETGID start Bob under that uid,
# DAC_OVERRIDE lets the root wrapper read and delete the scratch after the hand-over. The Bob
# process itself ends with no effective capabilities (the canary checks CapEff).
exec podman run --rm \
  --read-only \
  --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE \
  --security-opt no-new-privileges \
  --tmpfs /tmp:rw,exec,nosuid,size=256m \
  --pids-limit 512 \
  "$tag" "$@"
