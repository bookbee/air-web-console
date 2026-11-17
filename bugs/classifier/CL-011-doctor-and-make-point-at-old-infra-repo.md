# CL-011: `make doctor` reports Redis down when it is up, and `make up` points at a folder that doesn't exist

| | |
|---|---|
| **Status** | fixed (working tree, 2026-11-16) · verified |
| **Severity** | Low |
| **Service** | air-classifier-service @ `8e62f6c` |
| **Found** | 2026-11-16, running `make doctor` against the full local stack |
| **Console scenario** | none |

## Summary

The infrastructure repository was renamed from `air-infra` to
`air-infrastructure-service`, which also renamed its containers. The classifier's
tooling still used the old names, so its own diagnosis tool reported a healthy Redis
as down and told the engineer to `cd ../air-infra`, a folder that doesn't exist. The
orchestrator's Makefile gave the same wrong path.

## Reproduce

With the whole stack up and Redis healthy:

```bash
cd air-classifier-service && make doctor
```

## Actual (before the fix)

```
air-infra (redis)
  ✓ network 'air-net' is up
  ✗ air-infra's redis is not answering — 'cd ../air-infra && make ps'
Summary
  1 failure(s), 0 warning(s)
make: *** [doctor] Error 1
```

## Cause

`scripts/doctor.sh:56` ran `docker exec air-infra-redis-1 …`; the container is now
`air-infrastructure-service-redis-1`. `Makefile:21` and `scripts/doctor.sh:15`
defaulted `INFRA_DIR` to `../air-infra`. air-orchestrator-service's `Makefile:24,121`
printed the same path.

## Resolution

Reporter, 2026-11-16, uncommitted on top of `8e62f6c` (classifier) and `31838b0`
(orchestrator), as part of the handover documentation pass. Path and name corrections
only; no behaviour changed:

- air-classifier-service: `INFRA_DIR` defaults to `../air-infrastructure-service` in
  `Makefile` and `scripts/doctor.sh`; the Redis check uses
  `air-infrastructure-service-redis-1` (overridable with `REDIS_CONTAINER`); the
  compose file's header comment names the right folder.
- air-orchestrator-service: the `make help` footer, the `require-air-net` message and
  the compose file's header comment name the right folder.

Verified 2026-11-16: `make doctor` in air-classifier-service prints "all checks
passed" against the running stack.

The prose name "air-infra" is still used throughout both repositories' comments and
documents as the short name of the service. That is left as it is: the orchestrator
also reports the dependency as `air-infra` in `/v1/ready`, which is a wire label.
