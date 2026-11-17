# TG-004: Redis over TLS can't be used when the certificate doesn't match the host dialled

| | |
|---|---|
| **Status** | open |
| **Severity** | Medium (for deployment; no effect locally) |
| **Service** | air-tools-gateway @ `223d612` |
| **Found** | 2026-11-17, deploying to a local Kubernetes cluster with a TLS Redis; the Memorystore case is *code reading, not reproduced* |
| **Console scenario** | none |

## Summary

More than one replica of the tools gateway needs Redis (`STORE__BACKEND=redis`). In
GCP that is Memorystore with in-transit encryption, which clients dial **by IP
address**, so its server certificate does not match the host name being dialled. The
gateway's only Redis setting is a URL: there is no option for a CA file and none to
switch host-name verification off. A CA can be supplied from outside the service
(Node's `NODE_EXTRA_CA_CERTS`), but nothing can relax the host-name check. The
gateway and the classifier both have a way (`ssl_check_hostname=false` in their
URLs); this service is the only one of the three Redis users without one.

## What was verified

On a kind cluster, with a Redis that has AUTH and TLS only and a certificate whose
names match its service DNS name, the tools gateway connects and reports ready, with
two replicas, given:

```yaml
AIR_TOOLS_GATEWAY__STORE__REDIS_URL: rediss://:<password>@redis.air-model-gateway-deps.svc.cluster.local:6378/0
NODE_EXTRA_CA_CERTS: /etc/air/redis-ca/ca.pem          # the CA, mounted from a Secret
```

```
{"level":"info","service":"air-tools-gateway","msg":"store.redis_connected"}
```

So TLS with a private CA works. What is untested is a certificate that doesn't match
the dialled host, which is Memorystore's normal case.

## Cause

`src/actions/redis/client.ts:38`: `new Redis(settings.redisUrl, {…})`. A `rediss://`
URL makes ioredis use TLS with Node's default verification. The options passed don't
include `tls`, so neither a CA nor `checkServerIdentity` can be set from
configuration (`src/config.ts`, the `store` block has `backend`, `redis_url` and
`key_prefix`).

## Suggested fix

Two optional settings in the `store` block, both off by default:

- `redis_ca_file`: a path to a PEM file, passed as `tls.ca`. Removes the need for
  `NODE_EXTRA_CA_CERTS`, which trusts the CA for every outbound connection the
  process makes, not only Redis.
- `redis_tls_check_hostname` (default `true`): when `false`, pass a
  `checkServerIdentity` that accepts the certificate after the chain has verified
  against the CA. The chain is still checked; only the name is not.

## Verify

Against a TLS Redis whose certificate carries a different name than the one dialled
(on kind: connect by the Service's cluster IP): the gateway connects with the two
settings and refuses without them. Then in UAT against Memorystore: `/v1/ready` shows
`store` ok with two replicas.

## Until it is fixed

Deploy with `STORE__BACKEND: memory` and one replica if Memorystore refuses the
connection (air-infrastructure-service `docs/03-gke-runbook.md` §5.3).

## Resolution

_Filled in by the origin: commit or PR, date, notes. Then by the verifier:
date, build, result._
