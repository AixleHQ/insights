#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "Resetting Development Database"
echo "=========================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Confirm action
echo -e "${YELLOW}WARNING: This will drop and recreate the development database.${NC}"
echo -e "${YELLOW}All data will be lost.${NC}"
echo ""
read -p "Are you sure you want to continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Checking if PostgreSQL is running..."

if ! docker compose ps postgres | grep -q "running"; then
    echo "PostgreSQL is not running. Starting Docker services..."
    docker compose up -d postgres
    sleep 5
fi

echo ""
echo "Dropping database..."
cd packages/api
bundle exec rails db:drop || true

echo ""
echo "Creating database..."
bundle exec rails db:create

echo ""
echo "Running migrations..."
bundle exec rails db:migrate

echo ""
echo "Seeding database..."
bundle exec rails db:seed

cd ../..

echo ""
echo -e "${GREEN}Database reset complete!${NC}"
echo ""
