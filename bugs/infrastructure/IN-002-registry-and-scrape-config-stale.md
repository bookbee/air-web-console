# IN-002: The shared platform configuration still describes the old estate

| | |
|---|---|
| **Status** | open (the README port map is corrected in the working tree; the configuration is the origin's to decide) |
| **Severity** | Low |
| **Service** | air-infrastructure-service @ `ecea900` |
| **Found** | 2026-11-16, code reading and live call |
| **Console scenario** | none |

## Summary

This repository is the platform's single source for three shared tables: who may use
the broker, what Prometheus scrapes, and which port each service owns. All three
still describe services under their earlier names, and leave out most of today's
services. Nothing fails loudly, which is why it went unnoticed: the result is an
observability stack that scrapes one service out of five, and a policy document
whose grants match no current service.

## What is stale

| Where | Says | Today |
|---|---|---|
| `.env.example`, `SERVICE_TOKENS` | `air-classifier-dev:air-classifier`, `air-platform-dev:air-platform`, `air-client-dev:air-client` | The services are air-classifier-service, air-orchestrator-service and air-web-console. air-rag-service and air-tools-gateway have no token |
| `deploy/policy/policy.local.yaml` | Grants for `air-classifier`, `air-platform`, `air-client`; first comment says "Loaded by `air_infra.policy.engine`" (the Python module, since ported to Go) | Same |
| `deploy/prometheus/prometheus.yml` | Two jobs: this service, and `air-classifier` on `:8082` | air-orchestrator-service (`:8081`), air-model-gateway (`:8083`), air-tools-gateway (`:8084`) and air-rag-service (`:8087`) all expose `/metrics` and aren't scraped |
| `README.md` port map | `air-llm` on 8083, `air-tools` on 8084, `air-adapter` on 8088, `air-client` (Streamlit) on 8501, classifier routes `/v1/sentiment`, `/v1/feedback`, `/v1/reviews` | Corrected in the working tree on 2026-11-16 |
| `docker-compose.yml`, `grafana` | Publishes host port 3000 | air-web-console also serves on 3000, so `make up-observability` and the console can't run together |

## Reproduce

```bash
cd air-infrastructure-service
make up-observability          # with air-web-console stopped, or it fails on :3000
curl -s 'localhost:9090/api/v1/targets?state=active' | tr ',' '\n' | grep '"job"'
```

Expected from the configuration: only `air-infrastructure-service` and
`air-classifier` appear. *Code reading, not reproduced:* the console was serving on
port 3000 during this pass, so the observability profile wasn't started. The scrape
file has exactly those two jobs (`deploy/prometheus/prometheus.yml`).

## Why it matters

- DevOps will read this repository to learn what the platform needs. A scrape
  configuration that omits four services reads as "those services have no metrics".
- No sibling uses the broker for credentials today: the classifier and the tools
  gateway carry the Redis URL in their own compose files, and the orchestrator only
  probes `/v1/health`. The token and grant names were therefore never exercised
  after the renames.

## Suggested fix

1. Add a scrape job per service to `prometheus.yml`, on `host.docker.internal:<port>`
   like the classifier's, with `service` labels that match today's names.
2. Move Grafana to a free host port (3001), or note the clash beside the target.
3. Decide whether the broker's tokens and grants should follow today's service names.
   Renaming a token breaks any `.env` that sends the old one (compare MG-015 in the
   model gateway), so either add the new names beside the old ones or leave them and
   say in the policy file that the names are historical.

## Verify

`make up-observability`, then Prometheus's target page lists six jobs, each `up` when
its service is running. `make doctor` reports "all scrape targets up".

## Resolution

_Filled in by the origin: commit or PR, date, notes. Then by the verifier:
date, build, result._
