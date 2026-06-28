#!/usr/bin/env bash
# Pull ECS build base images. Uses GHCR mirrors when available (CI / dualboot-partners
# access); falls back to public Docker Hub (identical upstream images).
set -euo pipefail

PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
MK_FILE=".base-build-args.mk"
GHCR_RUBY="ghcr.io/dualboot-partners/db90-rails/ruby:3.4.8-slim"

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

if docker pull --platform "$PLATFORM" "$GHCR_RUBY" >/dev/null 2>&1; then
  echo "Using GHCR base images..."
  for img in \
    ghcr.io/dualboot-partners/db90-rails/ruby:3.4.8-slim \
    ghcr.io/dualboot-partners/db90-rails/node:24.13.0-slim \
    ghcr.io/dualboot-partners/db90-rails/nginx:alpine; do
    echo "Pulling $img ($PLATFORM)..."
    docker pull --platform "$PLATFORM" "$img"
  done
  write_ghcr_mk
else
  echo "GHCR access denied — using Docker Hub base images (same upstream as GHCR mirrors)." >&2
  ghcr_auth_hint
  for img in ruby:3.4.8-slim node:24.13.0-slim nginx:alpine; do
    echo "Pulling $img ($PLATFORM)..."
    docker pull --platform "$PLATFORM" "$img"
  done
  write_dockerhub_mk
fi
