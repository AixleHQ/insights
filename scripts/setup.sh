#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "Aixle Insights Development Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required tools
check_tool() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 found"
        return 0
    else
        echo -e "${RED}✗${NC} $1 not found"
        return 1
    fi
}

echo "Checking prerequisites..."
echo ""

MISSING_TOOLS=0
check_tool "docker" || MISSING_TOOLS=1
check_tool "ruby" || MISSING_TOOLS=1
check_tool "node" || MISSING_TOOLS=1
check_tool "npm" || MISSING_TOOLS=1
check_tool "bundle" || MISSING_TOOLS=1

echo ""

if [ $MISSING_TOOLS -eq 1 ]; then
    echo -e "${RED}Some required tools are missing. Please install them and try again.${NC}"
    exit 1
fi

# Check Ruby version
RUBY_VERSION=$(ruby -v | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
echo "Ruby version: $RUBY_VERSION"

# Check Node version
NODE_VERSION=$(node -v | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "Node version: $NODE_VERSION"

echo ""
echo "Installing dependencies..."
echo ""

# Install API dependencies
echo "Installing Rails API dependencies..."
cd packages/api
bundle install
cd ../..

# Install Web dependencies
echo ""
echo "Installing Web dependencies..."
cd packages/web
npm install
cd ../..

# Install Temporal worker dependencies
echo ""
echo "Installing Temporal worker dependencies..."
cd temporal
bundle install
cd ..

echo ""
echo "Starting Docker services..."
docker compose up -d

echo ""
echo "Waiting for PostgreSQL to be ready..."
until docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done
echo -e "${GREEN}PostgreSQL is ready${NC}"

echo ""
echo "Setting up database..."
cd packages/api
bundle exec rails db:create db:migrate db:seed || true
cd ../..

echo ""
echo "=========================================="
echo -e "${GREEN}Setup complete!${NC}"
echo "=========================================="
echo ""
echo "You can now run:"
echo "  make api    - Start Rails API server (http://localhost:3000)"
echo "  make web    - Start Vite dev server (http://localhost:5173)"
echo ""
echo "Docker services running:"
echo "  PostgreSQL:  localhost:5432"
echo "  Redis:       localhost:6379"
echo "  MinIO:       localhost:9000 (console: localhost:9001)"
echo "  Temporal:    localhost:7233 (UI: localhost:8088)"
echo "  Keycloak:    localhost:8080 (admin/admin)"
echo ""
