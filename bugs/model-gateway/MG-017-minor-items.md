# MG-017: Minor items from the 2026-11-16 SIT

| | |
|---|---|
| **Status** | open |
| **Severity** | Low |
| **Service** | air-model-gateway @ `85afed6` |
| **Found** | 2026-11-16, live calls |
| **Console scenario** | none |

**a. `429 rate_limited` has no `Retry-After`.** 200 concurrent cached
generates on one key: 57 × 200, 143 × 429, no `Retry-After` or rate headers
(the budget 429 has one). A caller can't tell how long to back off.

**b. `/v1/embed` embeds an empty or blank string.** `input: [""]` and
`["   "]` return the same vector, 200. `/v1/generate` refuses an empty user
message. This is what let air-rag-service answer a blank query with
match-level scores (RG-003, now refused there).

**c. `/v1/capabilities` and `/v1/ready` disagree about providers.** At the
same moment: capabilities `providers: {anthropic: true, llama.cpp: true}`
and `local` chain `available: true` listing `llama.cpp:llama-3.2-3b-gguf`;
ready `{anthropic: false, llama.cpp: false}`. If the first means
"configured" and the second "reachable", the field names should say so.

**d. A conversation may end on an assistant turn.** `[user, assistant]` is
accepted and Gemini continues the assistant's text ("! How are you doing
today?"). MG-013 refused other malformed conversations; prefill is rejected
by some providers, so the same request can succeed or fail by rung.

## Held

Gemini answers `cloud`, `auto` and a request with no `model`; structured
output with nullable fields, enums, `$ref` and an array root; `local` on
host Ollama (5.8 s on this CPU); provider preference validated (422 for a
provider the class doesn't offer); pins priced or refused; stream frames
`start`/`delta`/`done`, also from cache; cache per caller (another key
misses); every validation limit; 401 before a malformed body; 404/405 as
problem+json; `max_tokens: 1` → `finish_reason: length`.
