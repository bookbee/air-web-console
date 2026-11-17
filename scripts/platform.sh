#!/usr/bin/env bash
#
# Bring the whole AIR platform up on one machine, and say what is wrong when it
# isn't. Run through the Makefile: make platform-clone | platform-env |
# platform-up | platform-doctor | platform-status | platform-down.
#
# Every step is one a person would otherwise type by hand (`git clone`,
# `make env`, `make up`); this script only runs them in the right order and
# reads each service's own health and readiness routes. It changes no code in
# any repository. The only files it writes are untracked .env files:
#   - a missing .env is created from that repository's .env.example, and the
#     local-integration block in env/local/<service>.env (if there is one) is
#     appended, so a fresh setup is wired together from the first start;
#   - an .env that already exists is left alone, unless you run `env`
#     (make platform-env), which appends the block to it once.
#
# The sibling repositories sit next to this one:
#   <parent>/air-web-console  <parent>/air-infrastructure-service  ...
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${AIR_ROOT:-$(dirname "$HERE")}"
OVERLAYS="$HERE/env/local"
MARKER="AIR full local integration"

# name|host port|start order. The console itself is last and optional.
SERVICES=(
  "air-infrastructure-service|8080"
  "air-model-gateway|8083"
  "air-classifier-service|8082"
  "air-rag-service|8087"
  "air-tools-gateway|8084"
  "air-orchestrator-service|8081"
)

fail=0
warn=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail + 1)); }
note() { printf '  \033[33m!\033[0m %s\n' "$1"; warn=$((warn + 1)); }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

http_code() { curl -s -m "${2:-5}" -o /dev/null -w '%{http_code}' "$1" 2>/dev/null; }

# ---- doctor: read-only -------------------------------------------------------
check_tools() {
  hdr "Tools on this machine"
  if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then ok "docker daemon reachable"
    else bad "docker is installed but the daemon is not running — start Docker Desktop"; fi
  else
    bad "docker not found — install Docker Desktop (needed for 'make platform-up')"
  fi
  command -v make >/dev/null 2>&1 && ok "make" || bad "make not found"
  command -v curl >/dev/null 2>&1 && ok "curl" || bad "curl not found"

  if command -v ollama >/dev/null 2>&1; then
    if [ "$(http_code http://127.0.0.1:11434/api/tags 3)" = "200" ]; then
      ok "ollama answering on :11434"
      models="$(curl -s -m 3 http://127.0.0.1:11434/api/tags 2>/dev/null)"
      for m in llama3.2:3b nomic-embed-text; do
        if printf '%s' "$models" | grep -q "\"$m"; then ok "ollama model $m present"
        else bad "ollama model $m missing — run: ollama pull $m"; fi
      done
    else
      bad "ollama is installed but not answering on :11434 — start the Ollama app or 'ollama serve'"
    fi
  else
    bad "ollama not found — install it from https://ollama.com (the local models run there)"
  fi

  # Only needed to run a service on the host or to run its tests.
  command -v python3.12 >/dev/null 2>&1 && ok "python3.12 (host runs and tests of the Python services)" \
    || note "python3.12 not found — only needed for 'make dev/run/check' in the Python services"
  if command -v node >/dev/null 2>&1; then
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "$major" -ge 22 ]; then ok "node $(node -v) (console and tools-gateway host runs and tests)"
    else note "node $(node -v) found — the tools gateway needs Node 22; the console needs 20.9 or later"; fi
  else
    note "node not found — only needed for 'make dev/check' here and in air-tools-gateway (Docker runs need none)"
  fi
  command -v go >/dev/null 2>&1 && ok "go (only to change air-infrastructure-service)" \
    || note "go not found — only needed to change air-infrastructure-service"
}

check_repos() {
  hdr "Repositories under $ROOT"
  for entry in "${SERVICES[@]}"; do
    name="${entry%%|*}"
    if [ -f "$ROOT/$name/Makefile" ]; then
      if [ -f "$ROOT/$name/.env" ]; then ok "$name (.env present)"
      elif [ "$name" = "air-tools-gateway" ]; then ok "$name (needs no .env for Docker)"
      else note "$name has no .env yet — 'make platform-env' (or platform-up) creates it"; fi
    else
      bad "$name is not checked out next to air-web-console (expected $ROOT/$name) — run 'make platform-clone'"
    fi
  done
  if [ -f "$HERE/.env.local" ]; then ok "air-web-console (.env.local present)"
  else note "air-web-console has no .env.local yet — run 'make env'"; fi
}

check_services() {
  hdr "Services"
  for entry in "${SERVICES[@]}"; do
    name="${entry%%|*}"; port="${entry##*|}"
    health="$(http_code "http://127.0.0.1:$port/v1/health")"
    if [ "$health" != "200" ]; then
      bad "$name is not answering on :$port — cd ../$name && make up   (then: make logs)"
      continue
    fi
    ready="$(http_code "http://127.0.0.1:$port/v1/ready" 10)"
    if [ "$ready" = "200" ]; then ok "$name up and ready on :$port"
    else bad "$name is up on :$port but not ready (HTTP $ready) — curl -s localhost:$port/v1/ready"; fi
  done

  # The broker answers "ready" even when it can reach no store, and it reads no
  # service tokens without its .env. Both show up here rather than as a 401 later.
  infra="$(curl -s -m 5 http://127.0.0.1:8080/v1/ready 2>/dev/null)"
  if printf '%s' "$infra" | grep -q '"down"'; then
    bad "air-infrastructure-service reports a store down: $infra — run 'make env && make up' in that repo"
  fi

  code="$(http_code "http://127.0.0.1:3000/api/health")"
  if [ "$code" = "200" ]; then ok "air-web-console serving on http://127.0.0.1:3000"
  else note "air-web-console is not serving on :3000 — 'make dev' or 'make up' here"; fi
}

check_integration() {
  hdr "Integration (what the orchestrator is wired to)"
  ready="$(curl -s -m 10 http://127.0.0.1:8081/v1/ready 2>/dev/null)"
  if [ -z "$ready" ]; then note "orchestrator not reachable — skipped"; return; fi
  for dep in air-model-gateway air-classifier air-rag air-tools-gateway; do
    # {"service":"air-rag","configured":true,...}
    if printf '%s' "$ready" | grep -q "\"service\":\"$dep\",\"configured\":true"; then
      ok "$dep is configured"
    elif [ "$dep" = "air-model-gateway" ]; then
      bad "$dep is not configured — the orchestrator cannot answer without it"
    else
      note "$dep is switched off in the orchestrator's .env — 'make platform-env' turns it on, then restart it"
    fi
  done
  caps="$(curl -s -m 5 http://127.0.0.1:8083/v1/ready 2>/dev/null)"
  if [ -n "$caps" ]; then
    if printf '%s' "$caps" | grep -Eq '"(gemini|anthropic|openai)":true'; then
      ok "air-model-gateway has at least one cloud provider"
    else
      note "air-model-gateway has no cloud provider key — only the 'local' class answers (see docs/platform/03-local-setup.md §4)"
    fi
  fi
}

summary() {
  hdr "Summary"
  if [ "$fail" -eq 0 ] && [ "$warn" -eq 0 ]; then printf '  \033[32mall checks passed\033[0m\n\n'
  elif [ "$fail" -eq 0 ]; then printf '  \033[33m%d note(s), no failures\033[0m\n\n' "$warn"
  else printf '  \033[31m%d failure(s)\033[0m, %d note(s)\n\n' "$fail" "$warn"; fi
  exit $((fail > 0 ? 1 : 0))
}

# ---- clone -------------------------------------------------------------------
cmd_clone() {
  # Siblings come from the same place this repository did: the origin URL with
  # the repository name swapped. AIR_GIT_BASE overrides it (e.g. an SSH base).
  origin="$(git -C "$HERE" remote get-url origin 2>/dev/null || true)"
  base="${AIR_GIT_BASE:-${origin%/air-web-console*}}"
  suffix=""
  if [ -z "${AIR_GIT_BASE:-}" ]; then case "$origin" in *.git) suffix=".git" ;; esac; fi
  [ -n "$base" ] || { echo "No origin remote to derive the clone URL from. Set AIR_GIT_BASE, e.g. https://github.com/<org>"; exit 1; }
  for entry in "${SERVICES[@]}"; do
    name="${entry%%|*}"
    if [ -d "$ROOT/$name/.git" ]; then echo "  $name: already checked out"
    else
      echo "  $name: cloning"
      git clone --quiet --branch "${AIR_GIT_BRANCH:-develop}" "$base/$name$suffix" "$ROOT/$name" \
        || { echo "  could not clone $name: check your access, or set AIR_GIT_BASE / AIR_GIT_BRANCH"; exit 1; }
    fi
  done
  echo "Next: make platform-up"
}

# ---- env files ---------------------------------------------------------------
# append_overlay <service>: add env/local/<service>.env to that service's .env, once.
append_overlay() {
  name="$1"; target="$ROOT/$name/.env"; overlay="$OVERLAYS/$name.env"
  [ -f "$overlay" ] || return 0
  if grep -q "$MARKER" "$target"; then
    echo "    $name: local-integration block already in .env"
  else
    printf '\n' >> "$target"
    cat "$overlay" >> "$target"
    echo "    $name: appended the local-integration block (env/local/$name.env)"
  fi
}

# ensure_env <service> [force-overlay]: create a missing .env; wire it.
ensure_env() {
  name="$1"; dir="$ROOT/$name"
  if [ ! -f "$dir/.env" ]; then
    [ -f "$dir/.env.example" ] || return 0
    if grep -qE '^env:' "$dir/Makefile" 2>/dev/null; then (cd "$dir" && make env >/dev/null)
    else cp "$dir/.env.example" "$dir/.env"; fi
    echo "    $name: created .env from .env.example"
    append_overlay "$name"
  elif [ "${2:-}" = force-overlay ]; then
    append_overlay "$name"
  fi
}

cmd_env() {
  echo "Creating and wiring .env files (development keys only; nothing is overwritten)."
  for entry in "${SERVICES[@]}"; do
    name="${entry%%|*}"
    [ -f "$ROOT/$name/Makefile" ] || { echo "    $name: not checked out — run 'make platform-clone'"; continue; }
    ensure_env "$name" force-overlay
  done
  if [ ! -f "$HERE/.env.local" ]; then cp "$HERE/.env.example" "$HERE/.env.local"; echo "    air-web-console: created .env.local"; fi
  echo
  echo "Services read .env once at start-up: 'make platform-up' restarts them."
  echo "For cloud answers and order lookups, put a provider key in ../air-model-gateway/.env"
  echo "(AIR_MODEL_GATEWAY_PROVIDERS__GEMINI_API_KEY=...), then 'make platform-up' again."
}

# ---- up / down ---------------------------------------------------------------
cmd_up() {
  docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop first."; exit 1; }
  for entry in "${SERVICES[@]}"; do
    name="${entry%%|*}"; dir="$ROOT/$name"
    [ -f "$dir/Makefile" ] || { echo "missing $dir — run 'make platform-clone'"; exit 1; }
    printf '\n\033[1m%s\033[0m\n' "$name"
    ensure_env "$name"
    (cd "$dir" && make up) || { echo "make up failed in $name — see the output above"; exit 1; }
  done
  # The orchestrator answers a couple of seconds after its container starts.
  for _ in $(seq 1 30); do [ "$(http_code http://127.0.0.1:8081/v1/health 2)" = "200" ] && break; sleep 1; done
  echo
  echo "Backends started. Next:"
  echo "  make platform-doctor      # confirm everything is ready and wired together"
  echo "  make up  (or make dev)    # the console itself, http://127.0.0.1:3000"
}

cmd_down() {
  # Reverse order, infrastructure last: the others join its network.
  for ((i = ${#SERVICES[@]} - 1; i >= 0; i--)); do
    name="${SERVICES[$i]%%|*}"; dir="$ROOT/$name"
    [ -f "$dir/Makefile" ] || continue
    printf '\n\033[1m%s\033[0m\n' "$name"
    (cd "$dir" && make down) || true
  done
}

case "${1:-doctor}" in
  doctor)    check_tools; check_repos; check_services; check_integration; summary ;;
  status)    check_services; check_integration; summary ;;
  up)        cmd_up ;;
  down)      cmd_down ;;
  clone)     cmd_clone ;;
  env)       cmd_env ;;
  *) echo "usage: $0 clone|env|up|doctor|status|down"; exit 2 ;;
esac
