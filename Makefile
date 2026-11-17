HOST ?= 127.0.0.1
PORT ?= 3000

COMPOSE ?= docker compose --env-file .env.local
IMAGE   ?= air-web-console
TAG     ?= local

.DEFAULT_GOAL := help
.PHONY: help install env dev build start lint typecheck test check gateway-check rag-check tools-check customer-token-key image up down logs clean \
	platform-clone platform-env platform-doctor platform-up platform-status platform-down

help: ## Show this help
	@echo "AIR Web Console (air-web-console) — make <target>"
	@echo
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Overridable: HOST=$(HOST) PORT=$(PORT)"

install: ## Install dependencies
	npm install

env: ## Create .env.local from .env.example if it does not exist yet
	@test -f .env.local && echo ".env.local exists — leaving it alone." \
		|| { cp .env.example .env.local; echo ".env.local created."; }

dev: install env ## Serve natively with hot reload; Ctrl+C stops it
	npm run dev -- --hostname $(HOST) --port $(PORT)

build: ## Production build (native)
	npm run build

start: ## Serve the native production build (run `make build` first)
	npm run start -- --hostname $(HOST) --port $(PORT)

lint: ## Lint
	npm run lint

typecheck: ## Type-check
	npm run typecheck

test: ## Run the test suite
	npm run test

check: lint typecheck test ## Everything CI runs

GATEWAY_TARGET ?= local
gateway-check: ## Run every Model Gateway contract scenario against a live gateway (console must be serving; GATEWAY_TARGET=local)
	@set -a; . ./.env.local; set +a; \
		CONSOLE_URL=http://$(HOST):$(PORT) GATEWAY_TARGET=$(GATEWAY_TARGET) \
		npx vitest run --config tests/live/vitest.config.mts tests/live/gateway-check.live.test.ts

RAG_TARGET ?= local
rag-check: ## Run every RAG contract + SIT scenario against a live air-rag-service (console must be serving; RAG_TARGET=local)
	@set -a; . ./.env.local; set +a; \
		CONSOLE_URL=http://$(HOST):$(PORT) RAG_TARGET=$(RAG_TARGET) \
		npx vitest run --config tests/live/vitest.config.mts tests/live/rag-check.live.test.ts

TOOLS_TARGET ?= local
tools-check: ## Run every Tools Gateway simulation against a live air-tools-gateway (console must be serving; TOOLS_TARGET=local)
	@set -a; . ./.env.local; set +a; \
		CONSOLE_URL=http://$(HOST):$(PORT) TOOLS_TARGET=$(TOOLS_TARGET) \
		npx vitest run --config tests/live/vitest.config.mts tests/live/tools-check.live.test.ts

customer-token-key: ## Generate a customer-token signing pair (private line for .env.local; public PEM + JWK for the orchestrator). KID=brightcart-dev-1
	@node scripts/gen-customer-token-key.mjs $(KID)

image: env ## Build the runtime Docker image
	$(COMPOSE) build

up: env ## Run the console in Docker — nothing to install
	$(COMPOSE) up -d --build
	@echo "serving http://$(HOST):$(PORT) · 'make logs' to follow"

down: ## Stop the Docker console
	$(COMPOSE) down --remove-orphans

logs: ## Tail the Docker container logs
	$(COMPOSE) logs -f --tail=100

clean: ## Remove node_modules and build artifacts
	rm -rf node_modules .next

# ---- the whole AIR platform (sibling repositories checked out next to this one) ----
# Each target runs the sibling repositories' own make targets in the right order; see
# scripts/platform.sh and docs/platform/03-local-setup.md.
platform-clone: ## Clone the six sibling AIR repositories next to this one (skips those already there)
	@bash scripts/platform.sh clone

platform-env: ## Create each repository's .env and wire the services together for local use (env/local/)
	@bash scripts/platform.sh env

platform-up: ## Start every AIR backend in Docker, in dependency order (creates and wires missing .env files)
	@bash scripts/platform.sh up

platform-doctor: ## Check this machine and every AIR service; says how to fix what is missing
	@bash scripts/platform.sh doctor

platform-status: ## Health and readiness of every AIR service
	@bash scripts/platform.sh status

platform-down: ## Stop every AIR backend (data volumes are kept)
	@bash scripts/platform.sh down
