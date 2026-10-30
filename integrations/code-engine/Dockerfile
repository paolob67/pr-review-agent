# Reviewer image: Node.js, Bob Shell (pinned) and the reviewer core. No secrets in any layer.
# Base: node:24-slim (Debian bookworm), pinned by index digest (looked up 2026-10-30).
FROM node:24-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

# Bob Shell version is pinned; the npm registry integrity check is the only checksum available (S1).
ARG BOB_VERSION=2.0.9

# Unprivileged user that runs the Bob process (S11, G23). It owns nothing but its home directory.
RUN npm install -g "@ibm/bob@${BOB_VERSION}" \
 && npm cache clean --force \
 && groupadd --gid 10002 bobrun \
 && useradd --uid 10002 --gid 10002 --create-home --home-dir /home/bobrun --shell /usr/sbin/nologin bobrun \
 && bob --version \
 && mkdir -p /home/bobrun/.bob/settings \
 && printf '{\n  "general": { "disableAutoUpdate": true, "disableUpdateNag": true }\n}\n' > /home/bobrun/.bob/settings/settings.json \
 && chown -R 10002:10002 /home/bobrun

# Reviewer code is root-owned and not writable by the Bob user.
COPY reviewer/ /app/reviewer/
# Canary isolation test (S11, G23); run on demand with a command override, not part of the entrypoint.
COPY tests/container/ /app/tests/container/
RUN chmod -R go-w /app && chmod -R a+rX /app

ENV NODE_ENV=production \
    REVIEW_BOB_UID=10002 \
    REVIEW_BOB_GID=10002 \
    REVIEW_BOB_HOME=/home/bobrun

# The wrapper starts as root so it can start Bob as another UID; it holds all secrets, Bob gets only its key.
USER root
WORKDIR /app
ENTRYPOINT ["node", "/app/reviewer/bin/reviewer.js"]
