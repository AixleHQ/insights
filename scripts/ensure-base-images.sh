#!/usr/bin/env bash
# Pull ECS build base images. Uses GHCR mirrors when available (CI / dualboot-partners
# access); falls back to public Docker Hub (identical upstream images).
set -euo pipefail

PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
MK_FILE=".base-build-args.mk"
GHCR_RUBY="ghcr.io/dualboot-partners/db90-rails/ruby:3.4.8-slim"

# Retry knobs (override via env). Transient failures (network, timeout, registry
# rate limit) are retried with exponential backoff before giving up.
PULL_RETRIES="${PULL_RETRIES:-3}"
PULL_BACKOFF="${PULL_BACKOFF:-5}"

write_ghcr_mk() {
  cat > "$MK_FILE" <<'EOF'
BASE_BUILD_ARGS :=
WEB_BASE_BUILD_ARGS :=
WEB_NGINX_BUILD_ARGS :=
EOF
}

write_dockerhub_mk() {
  cat > "$MK_FILE" <<'EOF'
BASE_BUILD_ARGS := --build-arg=RUBY_REGISTRY=ruby
WEB_BASE_BUILD_ARGS := --build-arg=NODE_REGISTRY=node
WEB_NGINX_BUILD_ARGS := --build-arg=NGINX_REGISTRY=nginx
EOF
}

ghcr_auth_hint() {
  if command -v gh >/dev/null 2>&1; then
    if ! gh auth status 2>&1 | grep -q 'read:packages'; then
      echo "Hint: gh token is missing read:packages (required for GHCR pull)." >&2
      echo "  gh auth refresh -h github.com -s read:packages" >&2
      echo "  echo \"\$(gh auth token)\" | docker login ghcr.io -u \"\$(gh api user -q .login)\" --password-stdin" >&2
    fi
  fi
}

# Pull an image, retrying transient failures with exponential backoff.
docker_pull_retry() {
  local img="$1"
  local attempt=1 delay="$PULL_BACKOFF"
  while true; do
    if docker pull --platform "$PLATFORM" "$img"; then
      return 0
    fi
    if [ "$attempt" -ge "$PULL_RETRIES" ]; then
      echo "Failed to pull $img after $PULL_RETRIES attempts." >&2
      return 1
    fi
    echo "Pull of $img failed (attempt $attempt/$PULL_RETRIES) — retrying in ${delay}s..." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

# Decide GHCR vs Docker Hub. A genuine access denial falls back immediately;
# transient errors are retried so a flaky network doesn't silently downgrade us.
ghcr_available() {
  local out
  if out="$(docker pull --platform "$PLATFORM" "$GHCR_RUBY" 2>&1)"; then
    return 0
  fi
  if echo "$out" | grep -qiE 'denied|unauthorized|forbidden|not found|manifest unknown'; then
    return 1
  fi
  echo "GHCR probe failed transiently — retrying before falling back to Docker Hub..." >&2
  docker_pull_retry "$GHCR_RUBY"
}

if ghcr_available; then
  echo "Using GHCR base images..."
  for img in \
    ghcr.io/dualboot-partners/db90-rails/ruby:3.4.8-slim \
    ghcr.io/dualboot-partners/db90-rails/node:24.13.0-slim \
    ghcr.io/dualboot-partners/db90-rails/nginx:alpine; do
    echo "Pulling $img ($PLATFORM)..."
    docker_pull_retry "$img"
  done
  write_ghcr_mk
else
  echo "GHCR access denied — using Docker Hub base images (same upstream as GHCR mirrors)." >&2
  ghcr_auth_hint
  for img in ruby:3.4.8-slim node:24.13.0-slim nginx:alpine; do
    echo "Pulling $img ($PLATFORM)..."
    docker_pull_retry "$img"
  done
  write_dockerhub_mk
fi
