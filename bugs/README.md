# Bug reports for the AIR platform services

The AIR Web Console finds bugs in the services it tests. This folder hands
them to the team that owns each service (the *origin*), who fix them and
then verify the fix here. Each report is written so the origin can act on it
without the conversation that found it.

## Layout

```
bugs/
  README.md               this page: the process
  TEMPLATE.md             copy this for a new report
  <service>/
    README.md             index for that service: status table, test setup
    READINESS.md          the release/handover gate and where it stands
    last-run-<target>.txt the latest headless scenario run (make gateway-check)
    <ID>-<slug>.md        one report per bug
```

Service folders: `model-gateway/` (air-model-gateway). Add
`classifier/` (air-classifier-service) and `orchestrator/`
(air-orchestrator-service) the same way when they have reports.

## IDs

`<PREFIX>-<NNN>`, numbered in order and never reused, even when a report is
closed as a duplicate or won't-fix.

| Service | Prefix |
|---|---|
| air-model-gateway | `MG` |
| air-classifier-service | `CL` |
| air-orchestrator-service | `OR` |

The file name is the ID plus a short kebab-case slug, e.g.
`MG-001-gemini-nullable-schema.md`. Keep the slug when the title changes.

## Status

| Status | Meaning | Who sets it |
|---|---|---|
| `open` | Reported, not yet fixed | Reporter |
| `in-progress` | The origin is working on it | Origin |
| `fixed` | Fix done in the origin repo; the report names the commit or PR ("fixed, uncommitted" until there is one) | Origin |
| `verified` | Re-tested here against the fixed build and passed | Reporter or QA |
| `wont-fix` | The origin accepts the behaviour; the report says why | Origin |
| `duplicate` | Same as another report; links to it | Anyone |

Change the status in the report's header **and** in the service index
together. A report is closed only at `verified`, `wont-fix` or `duplicate`.

## Severity

| Severity | Meaning |
|---|---|
| **High** | Wrong results, money or security at risk, or a contract break callers can't work around. Fix before the next release. |
| **Medium** | A contract break or misleading behaviour that callers can work around. Fix soon. |
| **Low** | Diagnostics, docs, edge cases or cleanup. |

## Writing a report

1. Copy `TEMPLATE.md` to `<service>/<ID>-<slug>.md` and add a row to that
   service's index.
2. Reproduce against a running service and paste what really came back.
   Don't paste anything from memory. Label anything found by reading code
   rather than by a live call as *code reading, not reproduced*.
3. Give a repro the origin can run without the console: a `curl` with the
   service's **local development** key only. Never paste a staging or prod
   key, and never paste one of the console's own `.env.local` secrets.
4. Point to the cause by `path:line` in the origin repo, along with the
   commit you read it at, because line numbers drift.
5. Suggest a fix, but the origin owns the decision.
6. Say how to verify it. Prefer a console scenario: the Model Gateway
   tab's *known gaps* group holds one scenario per open bug that has a live
   repro. Each one asserts the promised behaviour, so it fails until the fix
   lands.

## Fixing and verifying

- **Origin:** set `in-progress`, fix the bug, then set `fixed` and fill in
  *Resolution* (commit or PR, and anything that changed in the contract).
- **Verifier:** run the repro and the named console scenario against the
  fixed build (`make gateway-check` runs every scenario headless). First
  confirm which process answers: exactly one listener on the port, started
  after the last change. If both pass, set `verified` and record the date and build.
  Move the scenario out of *known gaps* into its normal group in
  `src/components/<service>/data.ts`, so it keeps guarding against a
  regression. If either fails, set the status back to `open` and add a
  note.

## Ground rules

- **One session per repository at a time**, whether a person or an agent.
  The reporter writes the report and the *Verifier* notes; the origin writes
  *Resolution* and the status up to `fixed`. Neither rewrites the other's
  sections.
- **A result names its build.** Record the commit, or "uncommitted on top
  of `<commit>`", in every Resolution and verifier note.
- **Every finding becomes a check:** a known-gaps scenario here, a test in
  the origin repo, or both. That's what keeps the next pass from finding the
  same thing again.
