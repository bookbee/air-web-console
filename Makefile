HOST ?= 127.0.0.1
PORT ?= 3000

COMPOSE ?= docker compose --env-file .env.local
IMAGE   ?= air-web-console
TAG     ?= local

.DEFAULT_GOAL := help
.PHONY: help install env dev build start lint typecheck test check image up down logs clean

help: ## Show this help
	@echo "AIR Web Console (air-web-console) — make <target>"
	@echo
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
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
