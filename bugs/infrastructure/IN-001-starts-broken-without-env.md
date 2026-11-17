# IN-001: Started without a `.env`, the broker comes up with no tokens and the wrong store addresses

| | |
|---|---|
| **Status** | open |
| **Severity** | Medium |
| **Service** | air-infrastructure-service @ `ecea900` |
| **Found** | 2026-11-16, live call |
| **Console scenario** | none (`make platform-doctor` in air-web-console reports it) |

## Summary

`make up` (or `docker compose up`) on a checkout that has no `.env` starts a container
that looks healthy but can't do its job: it accepts no service token, so every
authenticated route is a 401, and it probes the stores on `localhost` inside the
container, so `/v1/ready` answers `"status":"ready"` with all three stores `"down"`.
The compose file says the opposite: "a fresh checkout comes up without anyone running
`make env` first". A new engineer who runs `make up` first, which is what every
sibling's error message tells them to do, gets a broker that fails its own
`make doctor`. This is the cause of environment finding 5 in
[SIT-2026-11-16](../SIT-2026-11-16.md).

## Reproduce

```bash
cd air-infrastructure-service
rm -f .env            # a fresh checkout has none
make up
curl -s localhost:8080/v1/ready
curl -s -X POST localhost:8080/v1/resources/postgres/credentials \
  -H 'X-API-Key: air-platform-dev' -H 'Content-Type: application/json' -d '{}'
make doctor
```

## Expected

Either the stack works without a `.env`, as `docker-compose.yml` lines 44–45 say, or
it refuses to start and names the missing file.

## Actual

```
{"status":"ready","stores":{"mongo":"down","postgres":"down","redis":"down"}}

{"type":"about:blank","title":"Unauthorized","status":401,"code":"unauthorized",
 "detail":"missing or invalid X-API-Key","request_id":"a7ad010b634a946d925fd9ab0bc8e137"}

  ✗ could not broker a credential — check AIR_INFRASTRUCTURE_SERVICE__SECURITY__SERVICE_TOKENS in .env
  1 failure(s), 1 warning(s)
```

All four store containers were healthy at the time (`make doctor`'s own store checks
pass). After `make env && make up` the same calls return
`{"status":"ready","stores":{"mongo":"ok","postgres":"ok","redis":"ok"}}` and a
credential, and `make doctor` is green.

## Cause

`docker-compose.yml:43-47`: the `.env` file is `required: false`, and the service's
`environment:` block sets only `AIR_INFRASTRUCTURE_SERVICE__ENVIRONMENT`. With no
file, the binary runs on `internal/config/config.go:91` `Default()`: no service
tokens, Redis at `redis://localhost:6379/0`, Postgres at `localhost:6432`, Mongo at
`mongodb://localhost:27017`. Those are right for `make run` on the host and wrong
inside the container, where the stores are `redis`, `pgbouncer` and `mongo`.

## Suggested fix

Any one of these; the first keeps the "no `.env` needed" promise:

1. Put the compose-network values in the service's `environment:` block (store
   addresses and the three development tokens), as air-tools-gateway and
   air-rag-service do for their development keys.
2. Make `up` depend on `env` in the Makefile, so `make up` creates the file.
3. Make `.env` `required: true`, so compose stops with a clear message.

Separately, `make up` could end with `make doctor`'s broker check, so the failure is
visible at once instead of on a sibling's first call.

## Verify

On a checkout with no `.env`: `make up && make doctor` is green, and
`curl -s localhost:8080/v1/ready` shows every store `ok`. In air-web-console,
`make platform-doctor` no longer prints "air-infrastructure-service reports a store
down".

## Resolution

_Filled in by the origin: commit or PR, date, notes. Then by the verifier:
date, build, result._

Reporter's note, 2026-11-16: air-web-console's `make platform-up` works around this by
running `make env` in each repository before `make up`. The workaround doesn't replace
the fix.
