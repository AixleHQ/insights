.PHONY: help setup up down api web db-create db-migrate db-seed db-reset test test-api test-web lint generate-types clean

# Default target
help:
	@echo "DB90 Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          - First-time project setup"
	@echo ""
	@echo "Docker:"
	@echo "  make up             - Start all Docker services"
	@echo "  make down           - Stop all Docker services"
	@echo "  make logs           - View Docker service logs"
	@echo ""
	@echo "Development:"
	@echo "  make api            - Run Rails API server locally"
	@echo "  make web            - Run Vite dev server locally"
	@echo "  make worker         - Run Temporal worker locally"
	@echo ""
	@echo "Database:"
	@echo "  make db-create      - Create development database"
	@echo "  make db-migrate     - Run database migrations"
	@echo "  make db-seed        - Seed development database"
	@echo "  make db-reset       - Reset development database"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-api       - Run Rails API tests"
	@echo "  make test-web       - Run frontend tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint           - Run all linters"
	@echo "  make lint-api       - Run Rubocop"
	@echo "  make lint-web       - Run ESLint"
	@echo ""
	@echo "Code Generation:"
	@echo "  make generate-types - Generate TypeScript types from OpenAPI"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          - Remove build artifacts and dependencies"

# ============================================================================
# Setup
# ============================================================================

setup:
	@echo "Running first-time setup..."
	./scripts/setup.sh

# ============================================================================
# Docker
# ============================================================================

up:
	docker compose up -d
	@echo "Waiting for Keycloak to start..."
	@sleep 15
	@docker exec db90-keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin 2>/dev/null || true
	@docker exec db90-keycloak /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE 2>/dev/null || true
	@echo ""
	@echo "Services started:"
	@echo "  PostgreSQL:  localhost:5432"
	@echo "  Redis:       localhost:6379"
	@echo "  MinIO:       localhost:9000 (console: localhost:9001)"
	@echo "  Temporal:    localhost:7233 (UI: localhost:8088)"
	@echo "  Keycloak:    localhost:8080"

down:
	docker compose down

logs:
	docker compose logs -f

# ============================================================================
# Development Servers
# ============================================================================

api:
	cd packages/api && bundle exec rails server -p 3000

web:
	cd packages/web && npm run dev

worker:
	cd temporal && bundle exec ruby workers/ingestion_worker.rb

# ============================================================================
# Database
# ============================================================================

db-create:
	cd packages/api && bundle exec rails db:create

db-migrate:
	cd packages/api && bundle exec rails db:migrate

db-seed:
	cd packages/api && bundle exec rails db:seed

db-reset:
	./scripts/reset-db.sh

# ============================================================================
# Testing
# ============================================================================

test: test-api test-web

test-api:
	cd packages/api && bundle exec rspec

test-web:
	cd packages/web && npm run test:run

# ============================================================================
# Linting
# ============================================================================

lint: lint-api lint-web

lint-api:
	cd packages/api && bundle exec rubocop

lint-web:
	cd packages/web && npm run lint

# ============================================================================
# Code Generation
# ============================================================================

generate-types:
	./scripts/generate-api-types.sh

# ============================================================================
# Cleanup
# ============================================================================

clean:
	@echo "Cleaning build artifacts..."
	rm -rf packages/api/tmp/*
	rm -rf packages/api/log/*
	rm -rf packages/web/dist
	rm -rf packages/web/node_modules/.vite
	@echo "Done."
