# CL-008: Minor input items: whitespace-only text gets a confident verdict, Aadhaar reported as a phone, PAN missed, oversize body is 400

| | |
|---|---|
| **Status** | open |
| **Severity** | Low |
| **Service** | air-classifier-service @ `335e649` (develop), container on `:8082` |
| **Found** | 2026-11-15, live calls through the console and direct |
| **Console scenario** | none |

## a. Whitespace-only text is classified, with 0.99 confidence

```bash
curl -s localhost:8082/v1/classify -H 'X-API-Key: airc_local_dev_key' -H 'Content-Type: application/json' \
  -d '{"text":"   \n\t "}' | jq '{decided_by, s: .sentiment}'
# -> decided_by t0_rules, neutral 0.99
```

`minLength: 1` counts whitespace. air-orchestrator-service refuses the same
input (its spec 0009 `REQ-VAL-003`), so the two services disagree on what a
text is. Expected: 422, `text: must contain more than whitespace`. Same for
batch items and summary items.

## b. Indian identifiers: Aadhaar counted as a phone, PAN not found

Text: `… call me on +91 98765 43210 or mail ravi.k@example.com, Aadhaar 2345
6789 0123, PAN ABCDE1234F …` → `pii_findings: email 1, credit_card 1,
phone 2`. The 12-digit Aadhaar number was redacted as a *phone*, and the
PAN wasn't detected at all. The tenants in this SIT price in INR; `national_id`
exists as a kind. Expected: `national_id 2` (Aadhaar with its Verhoeff
check, PAN `[A-Z]{5}[0-9]{4}[A-Z]`), `phone 1`.

## c. An oversize body is `400 malformed-request`, not `413`

A 30 MB body: `400 … Request body of 30000035 bytes exceeds the 1048576 byte
limit.` The limit itself is right; the status should be `413 Payload Too
Large` so a client can tell "too big" from "broken".

## d. `metadata` is echoed back in full

A 300 KB `metadata` object comes back verbatim in the response (bounded only
by the 1 MB body cap). Harmless at that size, but a per-field cap
(say 16 KB) or not echoing it would keep responses predictable.

## Resolution

_Filled in by the origin._
