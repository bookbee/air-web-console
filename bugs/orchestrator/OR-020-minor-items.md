# OR-020: Minor items from the 2026-11-16 SIT

| | |
|---|---|
| **Status** | open |
| **Severity** | Low |
| **Service** | air-orchestrator-service @ `c92c2ae` + this pass's working tree |
| **Found** | 2026-11-16, through the console BFF and direct calls |
| **Console scenario** | none |

**a. `answer.grounded` is always `false`.** Hard-coded in `engine/turn.py`
(`AnswerEvent(grounded=False)`), including on answers whose every sentence
cites a source. `REQ-RAG-014` (SHOULD) is unbuilt. Until it is, a caller
can't use the field; say so in the OpenAPI description or drop it.

**b. A refused cancellation carries a stray sentence.** "Cancel order 61007"
(delivered) answers: "That change isn't possible in the order's current
state. If you need more help, you can ask to speak to a person.\n\nI couldn't
get that one this time.\n\nCan I help with anything else?" The middle line is
the lookup-notice wording leaking into a refusal; for a wrong order number it
reads "I couldn't find that on your account… I couldn't get that one this
time." A delivered order could also be pointed at returns.

**c. A tight deadline is reported as an air-tools-gateway outage.**
`options.deadline_ms: 300` gives `degraded: ["air-tools-gateway",
"air-model-gateway"]`, `plan: skipped (no capabilities offered:
air-tools-gateway inventory unavailable)`. Neither service was asked. The
retrieval branch already handles this case properly ("turn deadline too close
to retrieve", no downstream named); `_turn_inventory` returns
`Inventory(available=False)` for it. Seven such turns did not open the tools
breaker, so it is only the label.

**d. With lookups excluded the assistant invents a verification step.**
`allow_routes: ["rag"]`, "Where is order 48213?" → "Could you please confirm
the delivery postcode for order 48213?" There is nothing it can do with a
postcode.

**e. An anonymous customer asking for their orders is told the lookup
failed.** No `air-token`: "I couldn't get your order history this time. To
see your past orders, please go to My Orders…". Nothing failed; the caller
isn't signed in, and the answer should say that.

**f. The business channel calls the analyst's query "the customer
message".** `/v1/query` "hi" → "The customer message is \"hi\"."; a data
question → "I would need access to the \"customer_message\" data source."
The delimiter's label reaches the answer.

**g. PII redaction misses PAN and CVV, and labels Aadhaar a phone.** Stored
turn: "My card [CARD] cvv 123, phone [PHONE], email [EMAIL], Aadhaar [PHONE],
PAN ABCDE1234F." (Same gap as CL-008 in the classifier.)

**h. `Content-Type: text/plain` with a JSON body is `422 __root__: Input
should be a valid dictionary`**, not 415.

**i. Hinglish in Latin script is answered in Devanagari** ("refund kab tak
aayega…" → "नमस्ते! अगर आप…"). Readable, but not the script the customer wrote in.

## Held in this pass

401/403 by key and channel, strict validation of every option, session
ownership (another customer, anonymous and the business key all get 404),
delete, injection refusal, escalation with a reference, isolation (70011 as
cust_1001 is "not found", SYSTEM OVERRIDE text ignored), prose consent and a
replayed confirm execute nothing, decline executes nothing, expired/tampered
tokens are 401, five parallel turns in one session are all stored, streamed
deltas equal the final answer with PII masked, `max_cost_usd` below the
planner's cost spends $0, Hindi answered in Hindi.
