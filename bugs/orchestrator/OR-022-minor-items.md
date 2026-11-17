# OR-022: Minor items from the handover pass

| | |
|---|---|
| **Status** | open |
| **Severity** | Low |
| **Service** | air-orchestrator-service @ `31838b0` |
| **Found** | 2026-11-16, live calls through the console's BFF |
| **Console scenario** | none |

Five small items, each independent.

## a. `make up` reports "could not probe" on a healthy start

```
ready:    could not probe (curl said "000") — try: make logs
```

`Makefile:141` waits a fixed 2 seconds before reading `/v1/ready`. On this machine the
container takes longer to listen, so `make up` ends with a message that sends the
engineer to the logs of a service that is fine; `make status` a few seconds later
says `ready: yes`. air-rag-service and air-tools-gateway poll `/v1/health` for up to
30 to 60 seconds before they probe. *Suggested fix:* the same loop here.

## b. The answer calls a stored date "today"

As `cust_1001`, "What is the status of order 48213, and how long do refunds take?" on
2026-11-16:

> Order 48213 is currently in transit. It was last updated today, November 14th, and
> is expected to be delivered by November 16th.

The lookup result carries the date; "today" is the model's addition and was wrong by
two days. Related to OR-016c (dates borrowed between fields). *Suggested fix:* give
the prompt the current date, or tell it never to describe a lookup's date relative to
now.

## c. An invented support procedure

As `cust_1001`, "My card 4111 1111 1111 1111 was charged twice for order 48213, email
me at ravi@example.com or call +91 98765 43210":

> To help you with the duplicate charge, could you please share a screenshot of your
> bank statement showing both charges?

No source in the turn describes that procedure, and asking a customer to send a bank
statement in chat is the opposite of the PII handling around it. Same family as
OR-016a (unsourced policy claims); it waits on the grounding check (`REQ-RAG-014`).

## d. The business channel declines general questions it has no data for

`POST /v1/query` with `{"query":"List three common reasons customers contact support
about deliveries."}` answers "I cannot answer this question without access to
customer support contact data". The stages show why: `classify`, `plan` and `gather`
are all `skipped` on the business channel, so it has no data source at all. That is
the build status (Phase 5 is not started), not a defect, but it should be said to
anyone demonstrating `/v1/query`: today it is a model call with a business persona
and guardrails, and nothing more.

## e. The credential-broker probe has no off switch

Added 2026-11-17, from deploying to a local Kubernetes cluster. `InfraSettings`
(`src/air_orchestrator_service/config.py:61`) has no `enabled` flag, unlike every other
downstream, so the service always probes air-infrastructure-service's broker at
`INFRA__BASE_URL` (default `http://localhost:8080`). That broker is a local development
tool and doesn't exist in a deployed environment, so there `/v1/ready` permanently
lists `air-infra` as `"reachable": false`. Readiness is unaffected (it gates on the
model gateway alone), but an operator reading the output sees a red dependency that is
expected. *Suggested fix:* an `enabled` flag, off outside development, reported as
`configured: false` like the other optional services.

## Resolution

_Filled in by the origin: commit or PR, date, notes. Then by the verifier:
date, build, result._
