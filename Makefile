ENV_FILE := apps/api/.env

ZAI_BASE_URL := $(shell grep -oP '(?<=ANTHROPIC_BASE_URL=)\S+' $(ENV_FILE) 2>/dev/null)
ZAI_MODEL    := $(shell grep -oP '(?<=AI_MODEL=)\S+' $(ENV_FILE) 2>/dev/null)
ZAI_API_KEY  ?= $(shell grep -oP '(?<=ANTHROPIC_API_KEY=)\S+' $(ENV_FILE) 2>/dev/null)

.PHONY: help dev build build-lowmem build-prod build-vps lint format clean clean-all \
        test test-api test-web test-field-mapping test-watch test-coverage \
        migration-run migration-create migration-show migration-revert \
        db-seed db-studio db-reset-passwords db-pull db-push db-backup \
        prod-restart prod-rollback \
        tunnel tunnel-setup tunnel-stop kill \
        test-zai

## help: Show this help message
help:
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /' | column -t -s ':'

## ── Dev ──────────────────────────────────────────────────────────────────────

## dev: Start API + web in development mode
dev:
	pnpm dev

## kill: Kill dev processes on ports 3001 and 5173
kill:
	pnpm kill

## ── Build ────────────────────────────────────────────────────────────────────

## build: Build all apps (16 GB RAM)
build:
	pnpm build

## build-lowmem: Build with low memory (3 GB, concurrency 2)
build-lowmem:
	pnpm build:lowmem

## build-prod: Build for production (4 GB, concurrency 1)
build-prod:
	pnpm build:prod

## build-vps: Build for VPS (1.5 GB, concurrency 1)
build-vps:
	pnpm build:vps

## ── Code quality ─────────────────────────────────────────────────────────────

## lint: Lint all apps
lint:
	pnpm lint

## format: Format all TS/MD files with Prettier
format:
	pnpm format

## clean: Remove dist, .turbo, and .vite directories
clean:
	pnpm clean

## clean-all: Remove node_modules and pnpm-lock.yaml
clean-all:
	pnpm clean:all

## ── Tests ────────────────────────────────────────────────────────────────────

## test: Run all tests
test:
	pnpm test

## test-api: Run API tests only
test-api:
	pnpm test:api

## test-web: Run web tests only
test-web:
	pnpm test:web

## test-field-mapping: Run Excel field mapping tests
test-field-mapping:
	pnpm test:field-mapping

## test-watch: Run tests in watch mode
test-watch:
	pnpm test:watch

## test-coverage: Run tests with coverage report
test-coverage:
	pnpm test:coverage

## ── Database migrations ───────────────────────────────────────────────────────

## migration-run: Run all pending migrations
migration-run:
	pnpm migration:run

## migration-create: Create a new migration file
migration-create:
	pnpm migration:create

## migration-show: Show pending migrations
migration-show:
	pnpm migration:show

## migration-revert: Revert the last migration
migration-revert:
	pnpm migration:revert

## ── Database ──────────────────────────────────────────────────────────────────

## db-seed: Seed the database
db-seed:
	pnpm db:seed

## db-studio: Open database studio
db-studio:
	pnpm db:studio

## db-reset-passwords: Reset all user passwords
db-reset-passwords:
	pnpm db:reset-passwords

## db-pull: Download production database to local
db-pull:
	pnpm db:pull

## db-push: Upload local database to production (destructive)
db-push:
	pnpm db:push

## db-backup: Trigger a backup on the production server
db-backup:
	pnpm db:backup

## ── Production ───────────────────────────────────────────────────────────────

## prod-restart: Restart the API on production via PM2
prod-restart:
	pnpm prod:restart

## prod-rollback: Rollback the last production deployment
prod-rollback:
	pnpm prod:rollback

## ── Tunnel ───────────────────────────────────────────────────────────────────

## tunnel: Start SSH tunnel
tunnel:
	pnpm tunnel

## tunnel-setup: Set up SSH tunnel configuration
tunnel-setup:
	pnpm tunnel:setup

## tunnel-stop: Stop SSH tunnel
tunnel-stop:
	pnpm tunnel:stop

## ── AI / ZAI ─────────────────────────────────────────────────────────────────

## test-zai: Test z.ai connection using credentials from apps/api/.env
test-zai:
	@if [ -z "$(ZAI_API_KEY)" ]; then \
		echo "ERROR: ANTHROPIC_API_KEY not found in $(ENV_FILE)"; exit 1; \
	fi
	@echo "Testing ZAI connection (model: $(ZAI_MODEL), endpoint: $(ZAI_BASE_URL))..."
	@CMD="curl -s -X POST '$(ZAI_BASE_URL)/messages' \
		-H 'Content-Type: application/json' \
		-H 'x-api-key: $(ZAI_API_KEY)' \
		-H 'anthropic-version: 2023-06-01' \
		-d '{\"model\":\"$(ZAI_MODEL)\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":16}'"; \
	## echo "$$CMD"; \
	eval "$$CMD" \
		| python3 -c "\
import json,sys; \
r=json.load(sys.stdin); \
err=r.get('error'); \
(print('FAILED —', err['message']) or exit(1)) if err else print('OK —', r['content'][0]['text'].strip())"
