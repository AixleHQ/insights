#!/usr/bin/env bash
set -euo pipefail

# Lambda artifacts for github-aws-runners/github-runner/aws module v6.5.5
# https://github-aws-runners.github.io/terraform-aws-github-runner/getting-started/#download-lambdas

RELEASE_TAG="v6.5.5"
BASE_URL="https://github.com/github-aws-runners/terraform-aws-github-runner/releases/download/${RELEASE_TAG}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for name in webhook runners runner-binaries-syncer; do
  echo "Downloading ${name}.zip ..."
  curl -fsSL -o "${DIR}/${name}.zip" "${BASE_URL}/${name}.zip"
done

echo "Done. Lambda zips saved to ${DIR}"
