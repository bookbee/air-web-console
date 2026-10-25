# MG-010: The gateway doesn't report which build it is, so a test run can't prove what it tested

| | |
|---|---|
| **Status** | verified |
| **Severity** | Medium (assurance and operations, not runtime behaviour) |
| **Service** | air-model-gateway @ `29fc4aa` |
| **Found** | 2026-10-25, live call and code reading |
| **Console scenario** | none (the `make gateway-check` report header prints whatever `/v1/health` returns) |

## Summary

`/v1/health` and `/v1/capabilities` report `version: "0.1.0"` only. No
commit, build time or dirty-tree flag is exposed, and the image has no
`org.opencontainers.image.revision` label. During this review, two gateway
processes ran on port 8083 at once: one from 07:11 serving code older than
the tree edited at 09:14–09:17, and one auto-reloading. A test run came back
"34/38 passed" against the stale one. Nothing in any response could tell the
two apart. QA sign-off, a deploy smoke test and an incident review all need
to answer "which code answered this?".

## Reproduce

```bash
curl -sS $GW/v1/health        # {"status":"ok","version":"0.1.0"}, whatever is deployed
```

## Expected

Every response, or at least health, identifies the exact build: the git
SHA, whether the tree was dirty, and the build time.

## Actual

`{"status":"ok","version":"0.1.0"}`. The Dockerfile, Helm chart and
`__init__.py` have no revision.

## Suggested fix

- Build arg `GIT_SHA` (with `-dirty` when the tree is) → env
  `AIR_MODEL_GATEWAY_BUILD__REVISION`. Expose it as `revision` in
  `/v1/health` and `/v1/capabilities`, and add the OCI revision label to the
  image.
- `make run` sets it from `git describe --always --dirty`.
- Optional: an `X-Gateway-Revision` response header.
- Optional: export it as a `build_info` metric, so dashboards show which
  revision each replica runs.

## Verify

`/v1/health` shows the SHA of the checkout or image. The
`make gateway-check` report header then records it automatically.

## Resolution

Fixed in air-model-gateway:
- **Setting.** `Settings.revision` (`AIR_MODEL_GATEWAY_REVISION`, default `unknown`).
- **Image.** The Dockerfile's `REVISION` build arg sets it, along with the
  `org.opencontainers.image.revision` label. CI and Deploy pass the commit SHA.
- **Local builds.** The Makefile exports `git describe --always --dirty --abbrev=12`
  for `make run` and for every image it builds (compose and kind).
- **Where it shows:** `/v1/health` and `/v1/capabilities` (`revision`), the
  `air-model-gateway.start` log line, and `air_model_gateway_build_info{version,revision}`.
- **Test:** `tests/test_system.py`.

**Live re-check, 2026-10-25:** this console's `make gateway-check` report header now
reads `health {"status":"ok","version":"0.1.0","revision":"6357b7a992e6-dirty"}`
([last-run-local.txt](last-run-local.txt)). The integration stack (`:9083`) and kind
report the same revision.

Commit: `6357b7a`.

**Verifier, 2026-10-26** (run by the gateway session at the owner's request) against `4dd28b7` (revision `4dd28b76537b`, clean; `src/` identical to `6357b7a`): `/v1/health` returns `{"status":"ok","version":"0.1.0","revision":"4dd28b76537b"}` (no `-dirty`), the boot line `air-model-gateway.start` carries the same revision, and the `make gateway-check` header records it ([last-run-local.txt](last-run-local.txt)). Status set to `verified`.
