# OR-012: The default config runs two workers on the in-memory session store: half of all follow-up turns get `404 No such session`

| | |
|---|---|
| **Status** | fixed (working tree, not committed) · verified |
| **Severity** | High |
| **Service** | air-orchestrator-service @ `8ed74d7` + working tree (OR-007/008/011), container on `:8081`, `APP__WORKERS=2`, `SESSION__BACKEND=memory` |
| **Found** | 2026-11-15, live calls (concurrent turns through the console, then sequential turns direct) |
| **Console scenario** | none |

## Summary

`config.py:45` defaults `app.workers` to **2**, and `.env.example` ships
`APP__WORKERS=2` with `SESSION__BACKEND=memory`. Each uvicorn worker process
has its own `InMemorySessionStore`, so a session (and its pending proposal)
exists in only one of them. A request that lands on the other worker gets
`404 No such session.`, which per `REQ-VAL-001`/OR-004 tells the client the
conversation is gone.

- **Sequential turns, one new connection each** (any client without
  keep-alive, a load balancer, a mobile app): **4 of 8 follow-ups 404'd**.
- **Concurrent turns** on one session through the console: 2 of 4 404'd; in
  a concurrent triple-confirm, one 404'd.
- The console itself mostly escapes it only because `undici` keeps one
  connection alive to one worker; after an idle gap (a customer reading a
  proposal for a few minutes) the next request can open a new connection.
- Breakers and the inventory cache are per worker too, so OR-007-style
  state and readiness differ by which worker answers.

The store's own docstring says it is "correct for a laptop and wrong for
anything autoscaled", but config lets it run under two workers on one
laptop, where it is already wrong.

## Reproduce

```python
import json, urllib.request
def turn(body):
    req = urllib.request.Request("http://127.0.0.1:8081/v1/chat", data=json.dumps(body).encode(),
        headers={"X-API-Key": "airo_local_customer_key", "Content-Type": "application/json",
                 "Connection": "close"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
s, j = turn({"message": "Hi, what's your return window?"}); sid = j["session_id"]
print([turn({"message": f"Follow-up {i}", "session_id": sid})[0] for i in range(8)])
# -> [404, 200, 404, 200, 200, 404, 404, 200]
```

## Expected

Every follow-up on a live session is 200, whichever process answers.

## Cause

`config.py:45` (`workers: int = Field(default=2, …)`), `__main__.py:24`
(passes it to uvicorn), and `memory/session.py:57` (a per-process dict). No
validator ties the two settings together.

## Suggested fix

1. In settings validation, refuse `session.backend == "memory"` with
   `app.workers > 1` (the same way config already refuses Redis without a
   URL), or force `workers = 1` for the memory backend with a startup
   warning.
2. Ship `.env.example` with either `WORKERS=1` or `SESSION__BACKEND=redis`
   (air-infra's Redis is already on air-net).
3. A test: settings with `memory` and `workers=2` fail to load.

## Verify

The repro prints eight 200s; the console's concurrent-turn check (four
messages at once on one session) returns no 404.

## Resolution

**Origin (air-orchestrator-service session, 2026-11-15):** new spec 0015
(single-process sessions), `REQ-SPS-001`/`002`. While sessions are held
in-process (memory, and redis until it's built), the service starts **one**
worker. A configured `APP__WORKERS` above 1 is reduced to 1 with an
`app.workers_reduced` warning, not refused, so a deployment still carrying
`WORKERS=2` doesn't crash-loop. The default and `.env.example` are 1. Breakers
and the inventory cache become single-process with it; replicas without
session affinity stay spec 0002's problem. The user's own `.env` still says
`WORKERS=2` (now harmless). `make check` 553 passed. Working tree, not
committed.

**Verified 2026-11-15 ~09:00 UTC** on `:8081`: the startup log has
`app.workers_reduced configured=2 used=1 session_backend=memory`; the repro's
eight `Connection: close` follow-ups are all 200; four concurrent turns on
one session through the console are all 200.
