# TG-002: Deeply nested `arguments` crash the request with a 500

| | |
|---|---|
| **Status** | fixed (working tree, uncommitted) · verified |
| **Severity** | Medium |
| **Service** | air-tools-gateway @ `77ab757`, container on `:8084` |
| **Found** | 2026-11-16, live call |
| **Console scenario** | none (headless: the body is hand-built) |

## Summary

A body whose `arguments` nest a few thousand levels deep is answered `500
upstream_error`, with a `RangeError: Maximum call stack size exceeded` in the
log. It is the caller's malformed input, well inside the body limit, and every
other bad input is a clean `400 invalid_arguments`. Any holder of a read key
can produce 500s (and error-rate alerts) at will.

## Reproduce

```bash
python3 -c "print('{\"subject\":\"cust_1001\",\"arguments\":' + '{\"a\":'*3000 + '1' + '}'*3000 + '}')" \
 | curl -s -X POST localhost:8084/v1/tools/orders.list_recent -H 'X-API-Key: airtg_read_local_dev' \
   -H 'Content-Type: application/json' --data-binary @-
```

## Expected

`400 invalid_arguments`.

## Actual

```
500 {"code":"upstream_error","detail":"An unexpected error occurred."}
log: RangeError: Maximum call stack size exceeded at structuredClone … registry.js checkArgs
```

## Cause

`src/capabilities/registry.ts` `checkArgs`: `structuredClone(args)` (and Ajv
after it) recurse once per level.

## Resolution

Fixed 2026-11-16 in the working tree: `checkArgs` refuses arguments nested
deeper than 32 levels (`arguments: nested too deeply`) with an iterative depth
check, before cloning. Test: `registry.test.ts` "refuses arguments nested too
deeply instead of overflowing the stack". `tsc`, eslint and 243 tests pass.
Verified on the rebuilt container: the repro is a 400.
