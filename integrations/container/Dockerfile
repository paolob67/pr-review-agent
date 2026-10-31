# Reviewer image: Ubuntu 24.04 (same OS family as the GitHub-hosted runner), Node.js, Bob Shell
# (pinned) and the reviewer core. No secrets in any layer.
# Base: ubuntu:24.04 pinned by index digest (looked up 2026-10-30, see docs/results/phase-4-container.md).
FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852

ARG NODE_VERSION=22.23.4
# SHA-256 of the official tarballs, from https://nodejs.org/dist/v22.23.4/SHASUMS256.txt
ARG NODE_SHA256_ARM64=6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b
ARG NODE_SHA256_X64=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce
# Bob Shell version is pinned; the npm registry integrity check is the only checksum available (S1).
ARG BOB_VERSION=2.0.9
ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils git \
 && rm -rf /var/lib/apt/lists/*

# Node.js from the official tarball, verified against the published SHA-256.
RUN set -eu; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "$arch" in \
      arm64) node_arch=arm64; sum="$NODE_SHA256_ARM64" ;; \
      amd64) node_arch=x64;   sum="$NODE_SHA256_X64" ;; \
      *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    file="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/${file}"; \
    echo "${sum}  ${file}" | sha256sum -c -; \
    tar -xJf "$file" -C /usr/local --strip-components=1 --no-same-owner; \
    rm -f "$file"; \
    node --version

# Ubuntu 24.04 ships a default "ubuntu" user at uid 1000; the Bob user is a separate fixed uid (S11, G23).
# Default user-level settings turn off auto-update and AGENTS.md loading (G30, S14). They live in a
# root-owned file; the wrapper copies them into the Bob home at start because that home is a tmpfs
# (Bob writes under ~/.bob and the rootfs is read-only, see docs/results/phase-4-runner.md).
RUN npm install -g "@ibm/bob@${BOB_VERSION}" \
 && npm cache clean --force \
 && groupadd --gid 10002 bobrun \
 && useradd --uid 10002 --gid 10002 --create-home --home-dir /home/bobrun --shell /usr/sbin/nologin bobrun \
 && bob --version \
 && mkdir -p /opt/bob-defaults \
 && printf '{\n  "general": { "disableAutoUpdate": true, "disableUpdateNag": true },\n  "bob-cline.useAgentRules": false\n}\n' > /opt/bob-defaults/settings.json \
 && chmod -R a+rX,go-w /opt/bob-defaults

# Reviewer code is root-owned and not writable by the Bob user.
COPY reviewer/ /app/reviewer/
# Canary isolation test (S11, G23); run on demand with a command override, not part of the entrypoint.
COPY tests/container/ /app/tests/container/
RUN chmod -R go-w /app && chmod -R a+rX /app && chmod 0755 /app/tests/container/probe-bob.mjs

ENV NODE_ENV=production \
    REVIEW_BOB_UID=10002 \
    REVIEW_BOB_GID=10002 \
    REVIEW_BOB_HOME=/home/bobrun

# The wrapper starts as root so it can start Bob as another UID; Bob gets only its own key.
USER root
WORKDIR /app
ENTRYPOINT ["node", "/app/reviewer/bin/reviewer.js"]
