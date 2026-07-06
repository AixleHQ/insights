.PHONY: help setup up down logs api web worker sidekiq db-create db-migrate db-structure-clean db-seed db-reset test test-api test-web test-cursor test-claude lint lint-api lint-web generate-types clean build build-cursor build-claude console remote-build remote-shell toolbox-shell staging-exec-api staging-exec-web staging-exec-keycloak staging-exec-temporal staging-exec-sidekiq staging-logs-api staging-logs-web staging-logs-keycloak staging-logs-temporal staging-logs-sidekiq watch-staging-logs-api watch-staging-logs-web watch-staging-logs-keycloak watch-staging-logs-temporal watch-staging-logs-sidekiq staging-build staging-build-api staging-build-keycloak staging-deploy staging-deploy-api staging-deploy-web staging-deploy-sidekiq staging-deploy-keycloak staging-deploy-temporal-worker prod-exec-api prod-exec-web prod-exec-keycloak prod-logs-api prod-logs-web prod-logs-keycloak prod-logs-temporal prod-logs-sidekiq watch-prod-logs-api watch-prod-logs-web watch-prod-logs-keycloak watch-prod-logs-temporal watch-prod-logs-sidekiq prod-build prod-deploy prod-deploy-api prod-deploy-web prod-deploy-sidekiq prod-deploy-keycloak prod-deploy-temporal-worker

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
	@echo "  make test-cursor    - Run db90-cursor tests (Vitest)"
	@echo "  make test-claude    - Run db90-claude tests (Vitest)"
	@echo "  make build-cursor   - Build db90-cursor package (TypeScript)"
	@echo "  make build-claude   - Build db90-claude package (TypeScript)"
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
	@echo "  make clean          - Remove build artifacts"
	@echo ""
	@echo "Remote (ECS operations):"
	@echo "  make remote-build              - Build remote container"
	@echo "  make remote-shell              - Shell into remote container"
	@echo "  make toolbox-shell             - Shell into toolbox container"
	@echo ""
	@echo "Staging — Exec:"
	@echo "  make staging-exec-api          - Exec into staging API container"
	@echo "  make staging-exec-web          - Exec into staging web container"
	@echo "  make staging-exec-sidekiq      - Exec into staging Sidekiq container"
	@echo "  make staging-exec-keycloak     - Exec into staging Keycloak container"
	@echo "  make staging-exec-temporal     - Exec into staging Temporal container"
	@echo ""
	@echo "Staging — Logs:"
	@echo "  make staging-logs-api          - View staging API logs"
	@echo "  make staging-logs-web          - View staging web logs"
	@echo "  make staging-logs-keycloak     - View staging Keycloak logs"
	@echo "  make staging-logs-temporal     - View staging Temporal logs"
	@echo "  make staging-logs-sidekiq      - View staging Sidekiq logs"
	@echo "  make watch-staging-logs-api    - Follow staging API logs"
	@echo "  make watch-staging-logs-web    - Follow staging web logs"
	@echo "  make watch-staging-logs-keycloak - Follow staging Keycloak logs"
	@echo "  make watch-staging-logs-temporal - Follow staging Temporal logs"
	@echo "  make watch-staging-logs-sidekiq  - Follow staging Sidekiq logs"
	@echo ""
	@echo "Production — Logs:"
	@echo "  make prod-logs-api             - View prod API logs"
	@echo "  make prod-logs-web             - View prod web logs"
	@echo "  make prod-logs-keycloak        - View prod Keycloak logs"
	@echo "  make prod-logs-temporal        - View prod Temporal logs"
	@echo "  make prod-logs-sidekiq         - View prod Sidekiq logs"
	@echo "  make watch-prod-logs-api       - Follow prod API logs"
	@echo "  make watch-prod-logs-web       - Follow prod web logs"
	@echo "  make watch-prod-logs-keycloak  - Follow prod Keycloak logs"
	@echo "  make watch-prod-logs-temporal  - Follow prod Temporal logs"
	@echo "  make watch-prod-logs-sidekiq   - Follow prod Sidekiq logs"
	@echo ""
	@echo "Build & Deploy (via ecs_helper):"
	@echo "  make staging-build             - Build & push all staging images"
	@echo "  make staging-build-keycloak    - Build & push staging Keycloak image"
	@echo "  make staging-deploy            - Deploy all staging services"
	@echo "  make staging-deploy-keycloak   - Deploy staging Keycloak"
	@echo "  make prod-build                - Build & push all prod images"
	@echo "  make prod-deploy               - Deploy all prod services"

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
# Code Generation
# ============================================================================

generate-types:
	./scripts/generate-api-types.sh

# ============================================================================
# Setup & Cleanup
# ============================================================================

setup: build up db-create db-migrate db-seed
	@echo "Setup complete! Open http://localhost:5173"

clean:
	@echo "Cleaning build artifacts..."
	docker compose exec api rm -rf tmp/* log/* || true
	docker compose exec web rm -rf dist || true
	@echo "Done."

# ============================================================================
# Remote (ECS exec/logs via remote container)
# ============================================================================

export CI_COMMIT_SHA    ?= $(shell git rev-parse HEAD)
export CI_COMMIT_BRANCH ?= $(shell git rev-parse --abbrev-ref HEAD)

REMOTE_EXEC = docker compose --profile remote run --rm --entrypoint make remote
REMOTE_RUN  = docker compose --profile remote run --rm remote
TOOLBOX_RUN = PROJECT=aixle-db90 docker compose --profile remote run --rm toolbox

# GHCR credentials are resolved lazily for build/push targets only (see the
# target-specific exports in the build section), so plain `make test` / `make up`
# never shell out to `gh`. They reach the toolbox container via docker-compose,
# which forwards GHCR_USER / GHCR_TOKEN from this process's environment.

-include .base-build-args.mk
BASE_BUILD_ARGS ?=
WEB_BASE_BUILD_ARGS ?=
WEB_NGINX_BUILD_ARGS ?=

ensure-base-images:
	@scripts/ensure-base-images.sh

# Optional in-container login when GHCR_TOKEN is set (gh auth token / PAT with read:packages).
TOOLBOX_GHCR_LOGIN = if [ -n "$$GHCR_TOKEN" ]; then echo "$$GHCR_TOKEN" | docker login ghcr.io -u "$${GHCR_USER:-token}" --password-stdin; fi;

remote-build:
	docker compose --profile remote build remote

remote-shell:
	docker compose --profile remote run --rm --entrypoint /bin/bash remote

toolbox-shell:
	$(TOOLBOX_RUN) /bin/bash

staging-exec-api:
	$(REMOTE_EXEC) exec_staging_api

staging-exec-web:
	$(REMOTE_EXEC) exec_staging_web

staging-exec-sidekiq:
	$(REMOTE_EXEC) exec_staging_sidekiq

staging-exec-keycloak:
	$(REMOTE_EXEC) exec_staging_keycloak

staging-exec-temporal:
	$(REMOTE_EXEC) exec_staging_temporal

staging-logs-api:
	$(REMOTE_EXEC) staging_api_logs

staging-logs-web:
	$(REMOTE_EXEC) staging_web_logs

staging-logs-keycloak:
	$(REMOTE_EXEC) staging_keycloak_logs

staging-logs-temporal:
	$(REMOTE_EXEC) staging_temporal_logs

staging-logs-sidekiq:
	$(REMOTE_EXEC) staging_sidekiq_logs

watch-staging-logs-api:
	$(REMOTE_EXEC) watch_staging_api_logs

watch-staging-logs-web:
	$(REMOTE_EXEC) watch_staging_web_logs

watch-staging-logs-keycloak:
	$(REMOTE_EXEC) watch_staging_keycloak_logs

watch-staging-logs-temporal:
	$(REMOTE_EXEC) watch_staging_temporal_logs

watch-staging-logs-sidekiq:
	$(REMOTE_EXEC) watch_staging_sidekiq_logs

prod-exec-api:
	$(REMOTE_EXEC) exec_prod_api

prod-exec-web:
	$(REMOTE_EXEC) exec_prod_web

prod-exec-keycloak:
	$(REMOTE_EXEC) exec_prod_keycloak

prod-exec-temporal:
	$(REMOTE_EXEC) exec_prod_temporal

prod-logs-api:
	$(REMOTE_EXEC) prod_api_logs

prod-logs-web:
	$(REMOTE_EXEC) prod_web_logs

prod-logs-keycloak:
	$(REMOTE_EXEC) prod_keycloak_logs

prod-logs-temporal:
	$(REMOTE_EXEC) prod_temporal_logs

prod-logs-sidekiq:
	$(REMOTE_EXEC) prod_sidekiq_logs

watch-prod-logs-api:
	$(REMOTE_EXEC) watch_prod_api_logs

watch-prod-logs-web:
	$(REMOTE_EXEC) watch_prod_web_logs

watch-prod-logs-keycloak:
	$(REMOTE_EXEC) watch_prod_keycloak_logs

watch-prod-logs-temporal:
	$(REMOTE_EXEC) watch_prod_temporal_logs

watch-prod-logs-sidekiq:
	$(REMOTE_EXEC) watch_prod_sidekiq_logs

# ============================================================================
# ECS Build & Push (via ecs_helper in toolbox container)
# ============================================================================

# Export GHCR creds only for build/push targets. Recursive `=` keeps the
# `gh` shell-out lazy (runs when the target executes, not at parse time), so
# plain `make test` / `make up` never touch `gh`. Listed on every build target
# (not just the umbrellas) so direct `make staging-build-api` also gets creds.
GHCR_BUILD_TARGETS = staging-build _staging-build prod-build _prod-build \
	staging-build-api staging-build-web staging-build-temporal-worker staging-build-keycloak \
	prod-build-api prod-build-web prod-build-temporal-worker prod-build-keycloak
$(GHCR_BUILD_TARGETS): export GHCR_USER = $(shell gh api user -q .login 2>/dev/null)
$(GHCR_BUILD_TARGETS): export GHCR_TOKEN = $(shell gh auth token 2>/dev/null)

staging-build:
	@$(MAKE) ensure-base-images
	@$(MAKE) _staging-build

_staging-build: staging-build-api staging-build-web staging-build-temporal-worker staging-build-keycloak

staging-build-api:
	$(TOOLBOX_RUN) sh -c '$(TOOLBOX_GHCR_LOGIN) ENVIRONMENT=staging APPLICATION=api ecs_helper build_and_push --image=api --file=./Dockerfile.api $(BASE_BUILD_ARGS)'

staging-build-web:
	$(TOOLBOX_RUN) sh -c '$(TOOLBOX_GHCR_LOGIN) ENVIRONMENT=staging APPLICATION=web ecs_helper build_and_push --image=web --file=./Dockerfile.web $(WEB_BASE_BUILD_ARGS) $(WEB_NGINX_BUILD_ARGS)'

staging-build-temporal-worker:
	$(TOOLBOX_RUN) sh -c '$(TOOLBOX_GHCR_LOGIN) ENVIRONMENT=staging APPLICATION=temporal-worker ecs_helper build_and_push --image=temporal-worker --file=./Dockerfile.temporal-worker $(BASE_BUILD_ARGS)'

staging-build-keycloak:
	$(TOOLBOX_RUN) sh -c '$(TOOLBOX_GHCR_LOGIN) ENVIRONMENT=staging APPLICATION=keycloak ecs_helper build_and_push --image=keycloak --file=./Dockerfile.keycloak'

prod-build:
	@$(MAKE) ensure-base-images
	@$(MAKE) _prod-build

_prod-build: prod-build-api prod-build-web prod-build-temporal-worker prod-build-keycloak

prod-build-api:
	$(TOOLBOX_RUN) sh -c '$(TOOLBOX_GHCR_LOGIN) ENVIRONMENT=production APPLICATION=api ecs_helper build_and_push --image=api --file=./Dockerfile.api $(BASE_BUILD_ARGS)'

prod-build-web:
	$(TOOLBOX_RUN) sh -c '$(TOOLBOX_GHCR_LOGIN) ENVIRONMENT=production APPLICATION=web ecs_helper build_and_push --image=web --file=./Dockerfile.web $(WEB_BASE_BUILD_ARGS) $(WEB_NGINX_BUILD_ARGS)'

prod-build-temporal-worker:
	$(TOOLBOX_RUN) sh -c '$(TOOLBOX_GHCR_LOGIN) ENVIRONMENT=production APPLICATION=temporal-worker ecs_helper build_and_push --image=temporal-worker --file=./Dockerfile.temporal-worker $(BASE_BUILD_ARGS)'

prod-build-keycloak:
	$(TOOLBOX_RUN) sh -c '$(TOOLBOX_GHCR_LOGIN) ENVIRONMENT=production APPLICATION=keycloak ecs_helper build_and_push --image=keycloak --file=./Dockerfile.keycloak'

# ============================================================================
# ECS Deploy (via ecs_helper in toolbox container)
# ============================================================================

staging-deploy: staging-deploy-api staging-deploy-web staging-deploy-sidekiq staging-deploy-keycloak staging-deploy-temporal-worker

staging-deploy-api:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=staging APPLICATION=api ecs_helper deploy --timeout 3600'

staging-deploy-web:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=staging APPLICATION=web ecs_helper deploy --timeout 3600'

staging-deploy-sidekiq:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=staging APPLICATION=sidekiq ecs_helper deploy --timeout 3600'

staging-deploy-keycloak:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=staging APPLICATION=keycloak ecs_helper deploy --timeout 3600'

staging-deploy-temporal-worker:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=staging APPLICATION=temporal-worker ecs_helper deploy --timeout 3600'

prod-deploy: prod-deploy-api prod-deploy-web prod-deploy-sidekiq prod-deploy-keycloak prod-deploy-temporal-worker

prod-deploy-api:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=production APPLICATION=api ecs_helper deploy --timeout 3600'

prod-deploy-web:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=production APPLICATION=web ecs_helper deploy --timeout 3600'

prod-deploy-sidekiq:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=production APPLICATION=sidekiq ecs_helper deploy --timeout 3600'

prod-deploy-keycloak:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=production APPLICATION=keycloak ecs_helper deploy --timeout 3600'

prod-deploy-temporal-worker:
	$(TOOLBOX_RUN) sh -c 'ENVIRONMENT=production APPLICATION=temporal-worker ecs_helper deploy --timeout 3600'
