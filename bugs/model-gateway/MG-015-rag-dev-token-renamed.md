# MG-015: The consumer rename changed air-rag-service's dev token too; RAG is locked out (401), unseeded and not ready

| | |
|---|---|
| **Status** | key fixed in air-rag-service's `docker-compose.yml` (uncommitted) · RAG still not ready: Ollama provider down (environment) |
| **Severity** | High (blocks RAG grounding end to end in local SIT) |
| **Service** | air-model-gateway @ `cb8a1d2` (contains `cf7bff1`), container re-created 2026-11-15 12:41 UTC; air-rag-service @ `705f871` |
| **Found** | 2026-11-15, reported by the air-orchestrator-service session, root-caused here |
| **Console scenario** | `make rag-check` (every retrieval row fails) |

## Summary

`cf7bff1` ("Rename consumer air-rag to air-rag-service") changed the
gateway's dev token map in `.env.example` from `air-rag-dev:air-rag` to
`air-rag-service-dev:air-rag-service`: the **token value**, not just the
consumer name. air-rag-service still sends `air-rag-dev`
(`air-rag-service/.env.example:28`, `AIR_RAG_SERVICE__MODEL_GATEWAY__API_KEY`).
When the gateway container was re-created with the new map (12:41 UTC
today), every RAG call became a 401:

- `/v1/retrieve` → `503 dependency-unavailable` "Could not embed the query
  through air-model-gateway."
- `/v1/ready` → `ready: false`, `air-model-gateway returned HTTP 401
  (unauthorized)`, `document_count: 0`. Startup seeding failed for the same
  reason, so the index is empty too.
- The orchestrator has since turned RAG off locally (`DOWNSTREAM__RAG__ENABLED=false`) to keep testing tools.

## Reproduce

```bash
for k in air-rag-dev air-rag-service-dev; do
  printf "%s -> " $k; curl -s -o /dev/null -w '%{http_code}\n' localhost:8083/v1/capabilities -H "X-API-Key: $k"
done
# air-rag-dev -> 401
# air-rag-service-dev -> 200
```

## Expected

A rename of the consumer *identity* keeps existing callers authenticating, or
lands together with the caller's config change.

## Suggested fix (either side, one line)

1. **air-rag-service:** set `AIR_RAG_SERVICE__MODEL_GATEWAY__API_KEY=air-rag-service-dev`
   in `.env.example` and the local `.env`, then re-create it seeded
   (`AIR_RAG_SERVICE_SEED_DIR=/app/sit/corpus make up`). This matches the
   gateway's documented map.
2. Or **air-model-gateway:** keep the old token value mapped to the new name
   (`air-rag-dev:air-rag-service`) in `.env.example` and `.env`.

Option 1 is the consistent end state: every other consumer's token is
`<consumer>-dev`. Either way, add the token pairing to both repos' docs so the
next rename changes both.

## Verify

`curl localhost:8087/v1/ready` → `ready: true`, `document_count: 29`; then
`make rag-check` 50/50.

## Resolution

**2026-11-15 ~13:40 UTC:** air-rag-service's `docker-compose.yml:40` now sets
`AIR_RAG_SERVICE__MODEL_GATEWAY__API_KEY: air-rag-service-dev` (uncommitted
edit in that repo; the compose `environment:` value overrides `.env`), and
the container was re-created. The 401 is gone. `.env.example:28` there still
says `air-rag-dev`, so a host run (`make run`) would still be refused: fix it
too before committing.

**Still not ready**, for an environment reason: `/v1/ready` →
`local-768-v1's provider (ollama) …` unreachable. The gateway container is
configured with `OLLAMA__BASE_URL=http://ollama:11434` (the compose Ollama
container), but Ollama now runs on the host (`:11434`). Either start the
gateway's Ollama container, or point the gateway at
`http://host.docker.internal:11434`. Then re-create air-rag-service seeded
and run `make rag-check`.

**Ollama cause (air-model-gateway session, 2026-11-15):** this needs no code change.
The previous container was started with plain `docker compose up`, which
defaults `OLLAMA__BASE_URL` to `http://ollama:11434` and the revision to
`unknown`. `make up` exports `host.docker.internal:11434` and the real
revision. The container was removed at 13:56 UTC (not by a session), and the
user will restart it with `make up` at `6e78609`. Verify then: `/v1/health`
revision `6e78609…`, `/v1/ready` with ollama and gemini true, RAG `ready: true`,
`make rag-check`.

**Re-checked 2026-11-15 ~14:01 UTC** at `6e78609` (`make up`): gateway
`/v1/ready` shows ollama and gemini true. air-rag-service `/v1/ready` →
`ready: true`, the gateway reachable, but `document_count: 0`, "index is
empty". The 401 and the Ollama URL are fixed. What's left is to re-create RAG
seeded, then run `make rag-check`.
