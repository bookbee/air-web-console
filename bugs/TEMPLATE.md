# <ID>: <one-line title>

| | |
|---|---|
| **Status** | open |
| **Severity** | High / Medium / Low |
| **Service** | <service> @ `<commit>` |
| **Found** | <YYYY-MM-DD>, <how: live call / code reading> |
| **Console scenario** | `<scenario-id>` (Model Gateway tab, *known gaps*), or none |

## Summary

One or two sentences: what's wrong and who it hurts.

## Reproduce

```bash
curl -sS ...
```

## Expected

What the contract (docs, OpenAPI) promises, with a link to where it says so.

## Actual

What came back, pasted.

## Cause

`path/to/file.py:NN`: why it happens.

## Suggested fix

What to change. Mention alternatives if they matter.

## Verify

How to confirm the fix: the repro's expected output, the console scenario,
and any test the origin should add.

## Resolution

_Filled in by the origin: commit or PR, date, notes. Then by the verifier:
date, build, result._
