# CL-010: `make check` is red on a clean checkout, and `make test` runs the paid `live` tests

| | |
|---|---|
| **Status** | open |
| **Severity** | Medium |
| **Service** | air-classifier-service @ `8e62f6c` (clean) |
| **Found** | 2026-11-16, running the repository's own gate |
| **Console scenario** | none |

## Summary

`make check` is the repository's stated CI gate, and it fails before any change is
made, for three unrelated reasons. A new engineer can't tell their own breakage from
the baseline, and the habit of ignoring a red gate is the real cost. One of the three
also spends money: with a gateway running, plain `make test` makes real cloud calls.

## Reproduce

```bash
cd air-classifier-service
make dev
make check                      # stops at the format check
.venv/bin/pytest                # the test step make check never reaches
```

## Expected

`make check` passes on a clean checkout of `develop`, with nothing else running.
`CLAUDE.md` and `pyproject.toml` both describe the `live` marker as "hits a real paid
API, opt-in only".

## Actual

```
4 files would be reformatted, 108 files already formatted
make: *** [lint] Error 1
```

```
FAILED tests/eval/test_golden_set.py::test_golden_case_gets_the_expected_label[t1-pos-2]
FAILED tests/eval/test_golden_set.py::test_golden_case_gets_the_expected_label[t1-neg-3]
FAILED tests/eval/test_golden_set.py::test_golden_case_gets_the_expected_label[t1-multilingual]
FAILED tests/eval/test_golden_set.py::test_golden_case_gets_the_expected_label[t1-short-neg]
FAILED tests/eval/test_golden_set.py::test_golden_case_gets_the_expected_label[t1-pos-4]
FAILED tests/eval/test_golden_set.py::test_live_case_resolves_correctly_through_the_full_ladder[live-sarcasm]
FAILED tests/eval/test_golden_set.py::test_live_case_resolves_correctly_through_the_full_ladder[live-irony]
FAILED tests/eval/test_golden_set.py::test_live_case_resolves_correctly_through_the_full_ladder[live-damning-praise]
8 failed, 1105 passed, 4 skipped
```

With `-m "not live"`: `5 failed, 1105 passed, 4 skipped, 3 deselected`. Ruff lint and
`mypy --strict` are clean.

## Cause

Three separate things:

1. **Formatting.** `ruff format --check` wants to rewrite four files (the README's
   known-issues table lists five; one has since been fixed). The check runs inside
   `make lint` (`Makefile:113-115`), so `make check` stops there and never runs a test.
2. **Five Tier 1 golden cases need the ONNX model**, which isn't in the repository
   (`./models` is empty). They run against the lexicon fallback and fail. Already
   listed in the README's known issues.
3. **`make test` doesn't deselect `live`.** `Makefile:98-99` runs bare `pytest`, and
   `pyproject.toml`'s `addopts` has no `-m "not live"`. The three `live` cases
   therefore run on every `make test` and `make check`: they fail when no gateway
   listens on `:8083`, and make real Tier 3 calls when one does. Only
   `make test-unit` and `make test-eval` exclude them.

## Suggested fix

1. Run `make fmt` and commit the result on its own.
2. Skip the Tier 1 golden cases when the scorer is the lexicon fallback
   (`pytest.skip` with the reason), or commit a small model fixture.
3. Add `-m "not live"` to `addopts`, or to the `test` target, so `live` is opt-in as
   documented. `make test-eval-live` already selects it explicitly with `-m live`,
   which overrides `addopts`.

## Verify

On a clean checkout with nothing else running: `make check` exits 0. With a gateway
running: `make test` makes no call to it (the gateway's log shows no request from
`air-classifier-service`).

## Resolution

_Filled in by the origin: commit or PR, date, notes. Then by the verifier:
date, build, result._
