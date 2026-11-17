# IN-003: Minor items

| | |
|---|---|
| **Status** | open |
| **Severity** | Low |
| **Service** | air-infrastructure-service @ `ecea900` |
| **Found** | 2026-11-16, live calls and code reading |
| **Console scenario** | none |

Four small items, each independent. `export INFRA=http://127.0.0.1:8080`.

## a. `pgbouncer:latest` in a file that says image tags are pinned

`docker-compose.yml:14` says "Image tags are pinned … a floating `:latest` here would
silently change the runtime that every other service's local behaviour was tuned
against". Line 92 is `image: edoburu/pgbouncer:latest`, and pgbouncer is on the data
path for every Postgres connection. (The three `tools` profile images are also
`:latest`, which the file explains and accepts.) *Suggested fix:* pin pgbouncer to
the tag in use.

## b. The broker hands out the superuser, not the least-privilege role

`deploy/postgres/init.sql` and `deploy/mongo/init.js` create an `air_app` role "the
broker can hand out in place of the superuser". The broker returns `username: "air"`,
the superuser (`internal/broker/secrets.go:42`, from `POSTGRES__USER`):

```bash
curl -s -X POST $INFRA/v1/resources/postgres/credentials \
  -H 'X-API-Key: air-client-dev' -H 'Content-Type: application/json' -d '{}'
# {"resource":"postgres",…,"username":"air","password":"localdevpass",…}
```

Local only, so the risk is small; the cost is that the pattern consumers copy is
"connect as the owner". *Suggested fix:* default `POSTGRES__USER` to `air_app` in
`.env.example`, or drop the unused role and its comment.

## c. A wrong method on a known route is a 404, and the 404 body is not problem+json

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $INFRA/v1/health     # 404, not 405
curl -s $INFRA/v1/nope                                                  # {"detail":"Not Found"}
```

Every other error from this service is `application/problem+json` with a `code` and a
`request_id`. `CLAUDE.md` records the 404 body as deliberate parity with the earlier
Python service, so this is a note for whoever next revises the contract, not a
regression: the other AIR services answer 404 and 405 as problem+json (MG-003 fixed
the same thing in the model gateway).

## d. Locally, every token can read the admin routes, and the registry dump includes store passwords

```bash
curl -s -o /dev/null -w '%{http_code}\n' $INFRA/v1/admin/policy -H 'X-API-Key: air-classifier-dev'   # 200
curl -s $INFRA/v1/admin/registry -H 'X-API-Key: air-classifier-dev' | head -c 200
# …"endpoint":{"url":"redis://:localdevpass@redis:6379/0"}…
```

`default_allow: true` in `policy.local.yaml` grants `admin_read` to everyone
(`internal/policy/engine.go:107`), and the registry's endpoints embed the Redis and
Mongo passwords in their URIs. Both are local-development conveniences and the
document says so. Recorded so that nobody copies `policy.local.yaml` as the starting
point for a stricter environment without setting `default_allow: false`.

## Resolution

_Filled in by the origin: commit or PR, date, notes. Then by the verifier:
date, build, result._
