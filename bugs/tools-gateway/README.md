# air-tools-gateway: bug reports

Found while adding air-tools-gateway to the AIR Web Console as its **Tools
Gateway** tab (2026-11-15). Process, statuses and severities are in
[../README.md](../README.md). Reports use the prefix `TG`.

| | |
|---|---|
| **Build tested** | air-tools-gateway @ `827aaeb`, fixture mode (`.env.example`), run with `tsx src/main.ts` in `node:22-slim` on `:8084` |
| **Last run** | [last-run-local.txt](last-run-local.txt): contract 31/31 on a freshly started gateway. A second run without a restart is 27/27 with 4 writes skipped (55120 and 70011 already cancelled), as designed |
| **Earlier build** | `f2a7472` plus uncommitted work, before execute landed: 23/31, all 8 failures `404 "No such endpoint."` on execute |

## Index

Every contract simulation passes against `827aaeb` and again against
`baec19d` (SIT 2026-11-15, 31/31). Found by direct calls beyond the suite:

| ID | Severity | Status | Title |
|---|---|---|---|
| [TG-001](TG-001-idempotency-key-replays-other-customers-result.md) | High | resolved (`3bceec1`, deployed to `:8084`) · verified | A reused `Idempotency-Key` replays another customer's execution as `done` |
| [TG-002](TG-002-deep-json-500.md) | Medium | fixed (working tree) · **verified** 2026-11-16 | Deeply nested `arguments` crash the request with a 500 (`RangeError` in `structuredClone`) |
| [TG-003](TG-003-minor-items.md) | Low | open | Minor: empty `subject` accepted, oversize body says "must be a JSON object", wrong method is 404 |
| [TG-004](TG-004-redis-tls-hostname-check-cannot-be-disabled.md) | Medium | open | Redis over TLS can't be used when the certificate doesn't match the host dialled (Memorystore by IP): no CA or host-name setting |

## Test setup

```bash
make tools-check                      # console serving; every simulation, report in last-run-local.txt
TOOLS_TARGET=qa make tools-check      # a remote target: fixture rows skip, writes skip
TOOLS_ALLOW_WRITES=1 TOOLS_TARGET=qa make tools-check   # ...and run the writes there too (real data!)
```

The local target uses the gateway's own development keys
(`airtg_read_local_dev`/`airtg_exec_local_dev`, tenant `brightcart`). The
headless cross-tenant rows also use `airtg_read_othershop_dev`/
`airtg_exec_othershop_dev`, set `TOOLS_OTHER_TENANT_{READ,EXECUTE}_KEY`
elsewhere.

The conversation rows **execute real cancellations**. In fixture mode they
use up order 55120 (cust_1001) and 70011 (cust_1002) until the gateway
restarts, and later runs skip them with that reason. Restart the gateway to
reset its fixtures before a run you want to count.

## What was checked

- **System:** `/v1/health`, `/v1/ready` (the `orders_backend` check), and
  `/metrics` (`air_tools_gateway_requests_total` and the duration histogram),
  all with no key.
- **Inventory:** every entry against the contract's Capability rules. The
  orchestrator silently drops a bad entry, so this is where such a mistake
  would show.
- **Reads:** "where are my recent orders", limit 1, and one order's detail.
- **Ownership and isolation (rule 4):** another customer's order is a 404
  byte-identical to a missing one, for both get and propose. With othershop's
  key, its own 55120 is ₹799 and brightcart's customers see nothing of
  brightcart's. Every result is also checked against the mirrored fixtures:
  only the subject's own orders, its own tenant's amounts, and no
  `customer_id`.
- **Rejections:**
  - the wrong route kind, and an undeclared capability, are `unknown_capability`;
  - bad arguments name field paths, never values;
  - limit range, a null subject, a `tenant` in the envelope and `subject` in the
    arguments are all rejected;
  - a shipped or delivered order is `422 invalid_state`.
- **Keys (rules 3 and 5):** no key and a made-up key are 401. The execute key
  can't read, list or propose, and the read key can't execute, all 403.
- **Execute:**
  - a missing or short `Idempotency-Key` is a 400;
  - an unknown proposal, a confirm from another customer, and another tenant's
    execute key all get the same 404, and nothing changes;
  - "Cancel my last order": nothing changes on propose; execute is `done` with
    the refund; the same key replays the first answer byte for byte; another key
    is `409 already_executed`; the order is cancelled once; proposing again is
    422;
  - two concurrent confirms: exactly one `done` and one `409`.
- **Every error** is problem+json with a closed-set `code`, `type` matching it,
  and no URL or stack trace in `detail`; `X-Request-ID` is echoed every time.

Not simulated: `proposal_expired` (it needs a wait of over 10 minutes, or a
gateway started with a short TTL), `pending_approval` (no v1 capability is
high risk), and the 502/504 upstream paths (fixture mode has no backend to
fail).
