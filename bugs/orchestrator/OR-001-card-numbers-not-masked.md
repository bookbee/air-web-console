# OR-001: Card numbers aren't masked on input: stored in session history and sent to the classifier, the gateway and the cloud LLM

| | |
|---|---|
| **Status** | verified |
| **Severity** | High |
| **Service** | air-orchestrator-service @ `ee242e1` |
| **Found** | 2026-11-14, live call (SIT) |
| **Console scenario** | none (Orchestrator tab, manual: send the message, then GET the session) |

## Summary

`mask_input` masks email, phone, address and name, but **not payment cards**.
An unspaced card (`4111111111111111`) passes through **in full**. A spaced
or dashed one is caught by the *phone* rule, which consumes 12 digits and
leaves the last group, so it's half-masked as `[PHONE] 1111`. The
"masked" text is what is stored in the session, sent to air-classifier,
sent to air-model-gateway and from there to Anthropic. That is PAN in
at-rest storage and in a third party's logs.

## Reproduce

```bash
export OR=http://127.0.0.1:8081 CUST=airo_local_customer_key
SID=$(curl -sS -X POST $OR/v1/chat -H "X-API-Key: $CUST" -H 'Content-Type: application/json' \
  -d '{"message":"My card 4111111111111111 was charged twice"}' | jq -r .session_id)
curl -sS -H "X-API-Key: $CUST" $OR/v1/sessions/$SID | jq -r '.turns[0].content'
```

## Actual

| Input card | Stored user turn |
|---|---|
| `4111 1111 1111 1111` | `My card [PHONE] 1111 was charged twice.` |
| `4111-1111-1111-1111` | `My card [PHONE]-1111 was charged twice.` |
| `4111111111111111` | `My card 4111111111111111 was charged twice.` |
| `5500 0000 0000 0004` | `My card [PHONE] 0004 was charged twice.` |
| `3782 822463 10005` (Amex) | `My card [PHONE] 10005 was charged twice.` |

## Expected

`mask_input`'s docstring: "Full-token redaction — the masked text is what
gets used and stored from here on". A card number should become `[CARD]`
before anything is stored or forwarded.

## Cause

`guardrails/pii.py:55-75`: the masking table is `email`, `phone`, `address`
(then `name`). There is no card entry. A Luhn-checked `credit_card` pattern
already exists, but only in `_OUTPUT_PATTERNS` (`pii.py:124`), which
scans *model output*, not input. Because `phone` runs first with
`{9,11}` digits, it eats a prefix of a spaced card, and the remainder no
longer looks like anything.

## Suggested fix

Add a `("credit_card", <13–19 digit pattern with optional space/dash>, "[CARD]")`
entry, **Luhn-validated** like the output scanner (to spare order and tracking
ids), and run it **before** `phone`. Reuse `_OUTPUT_PATTERNS["credit_card"]`
and the existing Luhn helper so input and output can't drift apart.

## Verify

All five rows above store `My card [CARD] was charged twice.` A
16-digit non-Luhn order id (`1234567812345678`) is left alone. Add unit
tests for each format plus the non-Luhn negative case.

## Resolution

**Origin (air-orchestrator-service session, reported 2026-11-14):** fixed, air-orchestrator-service uncommitted on top of `ee242e1` (native `make run --reload`, reloaded 04:56:13Z). Spec 0007 (REQ-PII-001..005). One Luhn-checked card rule (13–19 digits, spaces/dashes, any grouping) shared by input and output, run before `phone`. Tests: `test_guardrails_pii.py::test_a_card_number_is_masked_on_input` (5 formats), `::test_a_non_luhn_digit_run_is_not_masked_as_a_card`, `::test_input_and_output_share_one_card_rule`, `::test_a_card_next_to_other_pii_masks_both`; `test_turns.py::test_a_card_number_is_never_stored_or_forwarded`. Contract: additive (`[CARD]` token, `credit_card` category). `make check` 321 passed.

**Verifier (2026-11-14 ~05:10 UTC):** repro re-run live. All five formats store `My card [CARD] was charged twice.`; non-Luhn `1234567812345678` is kept. **Passed.**
