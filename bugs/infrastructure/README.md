# air-infrastructure-service: bug reports

Found during the handover pass on 2026-11-16 (see
[../SIT-2026-11-16-handover.md](../SIT-2026-11-16-handover.md)), the first time this
repository was tested from the AIR Web Console. Process, statuses and severities are
in [../README.md](../README.md). Reports use the prefix `IN`.

| | |
|---|---|
| **Build tested** | `air-infrastructure-service` @ `ecea900` (clean), container `air-infrastructure-service:local` on `:8080`, started with `make up` |
| **Stack** | redis 7, postgres 16, pgbouncer, mongo 7 from the same compose file; Docker Desktop 29.9.3 |
| **Its own gate** | `make check` passes (lint, vet, tests) at that commit, so none of these is caught by its tests |

## Index

| ID | Severity | Status | Title |
|---|---|---|---|
| [IN-001](IN-001-starts-broken-without-env.md) | Medium | open | Started without a `.env`, the broker has no tokens and looks for the stores on `localhost`: every call is a 401 and `/v1/ready` says `ready` with every store `down` |
| [IN-002](IN-002-registry-and-scrape-config-stale.md) | Low | open (port map fixed in the README, working tree) | The platform's shared configuration still describes the old estate: service tokens, policy grants and Prometheus scrape jobs name services that were renamed or never existed, and four of the five services aren't scraped |
| [IN-003](IN-003-minor-items.md) | Low | open | Minor: `pgbouncer:latest` in a file that says tags are pinned, the broker hands out the superuser, a wrong method is a 404, admin routes open to every token locally |

## Test setup

```bash
export INFRA=http://127.0.0.1:8080 KEY=air-platform-dev
```

`KEY` is one of the three development tokens in the repository's `.env.example`.

## What was checked and works

With a `.env` in place (`make env && make up`): `make doctor` is green; `/v1/health`
and `/v1/ready` answer with no key and `/v1/ready` reports all three stores `ok`;
every other route is a 401 without a key; `GET /v1/resources` lists only what the
token is explicitly granted (redis for `air-classifier-dev` and `air-client-dev`, all
three for `air-platform-dev`); a credential for Postgres, issued through the broker,
connects through pgbouncer; an unknown resource is a `404 resource_not_found`
problem+json; malformed JSON is a 422; `X-Request-ID` is returned on every response;
`/metrics` counts issued credentials per resource.

Already documented by the repository as known gaps, re-confirmed and not re-reported:
`rate_per_minute` is never enforced (200 credential calls in a burst on a 60 rpm
token: 200 × 200, `…_ratelimited_total` absent); credentials never expire; only the
`env` secret backend is real.
