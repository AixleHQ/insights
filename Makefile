.PHONY: help setup hooks up down logs logs-api logs-web logs-sidekiq api web worker sidekiq db-create db-migrate db-structure-clean db-seed db-reset test test-api test-web lint lint-api lint-web check generate-types clean build console

help:
	@echo "Aixle Insights Development Commands"
	@echo ""
	@echo "Docker:"
	@echo "  make up             - Start all services (infra + app)"
	@echo "  make down           - Stop all services"
	@echo "  make build          - Build/rebuild app containers"
	@echo "  make logs           - Tail all logs"
	@echo "  make logs-api       - Tail Rails API logs"
	@echo "  make logs-web       - Tail Vite dev server logs"
	@echo "  make logs-sidekiq   - Tail Sidekiq logs"
	@echo ""
	@echo "Development:"
	@echo "  make api            - Start/attach the Rails API service (foreground)"
	@echo "  make web            - Start/attach the Vite dev server (foreground)"
	@echo "  make console        - Rails console inside api container"
	@echo "  make worker         - View Temporal worker logs"
	@echo "  make sidekiq        - View Sidekiq status"
	@echo ""
	@echo "Database:"
	@echo "  make db-create      - Create development database"
	@echo "  make db-migrate          - Run database migrations (auto-cleans structure.sql)"
	@echo "  make db-structure-clean  - Strip TimescaleDB internal chunks from structure.sql"
	@echo "  make db-seed        - Seed development database"
	@echo "  make db-reset       - Reset development database"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-api       - Run Rails API tests (RSpec)"
	@echo "  make test-web       - Run frontend tests (Vitest)"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint           - Run all linters"
	@echo "  make lint-api       - Run Rubocop"
	@echo "  make lint-web       - Run ESLint"
	@echo "  make check          - Run linters + tests (pre-push)"
	@echo ""
	@echo "Code Generation:"
	@echo "  make generate-types - Generate TypeScript types from OpenAPI"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          - Remove build artifacts"

# ============================================================================
# Docker
# ============================================================================

build:
	docker compose build api web

up:
	docker compose up -d
	@echo "Waiting for Keycloak to start..."
	@sleep 15
	@docker exec db90-keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin 2>/dev/null || true
	@docker exec db90-keycloak /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE 2>/dev/null || true
	@echo ""
	@echo "Services started:"
	@echo "  Rails API:   http://localhost:3000"
	@echo "  Vite:        http://localhost:5173"
	@echo "  PostgreSQL:  localhost:5432"
	@echo "  Redis:       localhost:6379"
	@echo "  MinIO:       localhost:9000 (console: localhost:9001)"
	@echo "  Temporal:    localhost:7233 (UI: localhost:8088)"
	@echo "  Sidekiq UI:  http://localhost:3000/admin/sidekiq"
	@echo "  Keycloak:    localhost:8080"
	@echo ""
	@echo "Verifying critical services..."
	@docker compose ps --format '{{.Name}} {{.State}}' | grep -q "db90-worker.*running" && echo "  ✓ Temporal worker running" || echo "  ✗ WARNING: Temporal worker not running — ingest events will queue but not process!"

down:
	docker compose down

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-web:
	docker compose logs -f web

logs-sidekiq:
	docker compose logs -f sidekiq

# ============================================================================
# Development
# ============================================================================

api:
	docker compose up api

web:
	docker compose up web

console:
	docker compose exec api bundle exec rails runner -

worker:
	docker compose logs --tail=20 -f worker

sidekiq:
	docker compose logs --tail=20 sidekiq

# ============================================================================
# Database
# ============================================================================

db-create:
	docker compose exec api bundle exec rails db:create

db-migrate:
	docker compose exec api bundle exec rails db:migrate

db-structure-clean:
	docker compose exec api bundle exec rails db:structure:clean

db-seed:
	docker compose exec api bundle exec rails db:seed

db-reset:
	docker compose exec api bundle exec rails db:reset

# ============================================================================
# Testing
# ============================================================================

test: test-api test-web

test-api:
	docker compose exec api bundle exec rspec

test-web:
	docker compose exec web npm run test:run

# ============================================================================
# Linting
# ============================================================================

lint: lint-api lint-web

lint-api:
	docker compose exec api bundle exec rubocop

lint-web:
	docker compose exec web npm run lint

# ============================================================================
# Check
# ============================================================================

check: lint test

# ============================================================================
# Code Generation
# ============================================================================

generate-types:
	./scripts/generate-api-types.sh

# ============================================================================
# Setup & Cleanup
# ============================================================================

setup: hooks build up db-create db-migrate db-seed
	@echo "Setup complete! Open http://localhost:5173"

# Route git to the tracked hooks (auto DCO sign-off). Safe to re-run.
hooks:
	git config core.hooksPath .githooks
	@echo "Git hooks enabled (.githooks) — commits get a DCO Signed-off-by automatically."

clean:
	@echo "Cleaning build artifacts..."
	docker compose exec api rm -rf tmp/* log/* || true
	docker compose exec web rm -rf dist || true
	@echo "Done."
