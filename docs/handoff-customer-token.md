# Handoff: air-web-console mints a development customer token for air-orchestrator-service

You are working in `~/git/air-web-console`. Add a **development customer token**: a short-lived
JWT that the console's BFF mints server-side and sends to air-orchestrator-service on every
customer-channel chat request, beside the existing `X-API-Key`. It lets a tester chat "as"
a specific Brightcart customer (for example `cust_1001`), so that order lookups such as
"where is my order?" can be tested end to end once the orchestrator and air-tools-gateway
support them.

## 0. Ground rules

- **Read `CLAUDE.md` and `AGENTS.md` first.** "The BFF is the trust boundary" governs this
  whole change. The signing key is an upstream credential exactly like an API key: it lives
  only in server-side env, never in `NEXT_PUBLIC_*`, never in a response, never in an
  `Exchange`.
- **The token format is fixed input**, set by air-orchestrator-service's spec 0014
  (`~/git/air-orchestrator-service/docs/specs/0014-customer-token/spec.md`, §5 `REQ-CTK-002`
  and `003`). Read it. If the format can't be met, write the question down for the
  orchestrator session rather than changing it.
- **Do not edit any other repo.** Reading air-orchestrator-service for the spec is fine.
- **It is safe to ship before the orchestrator verifies tokens.** Today the orchestrator
  ignores unknown headers. Once spec 0014 lands, it verifies the token and refuses a bad one
  with `401 invalid-customer-token`.
- Don't commit or push unless the user asks. Run `make check` (and `npm run build`, which
  CI also runs) before calling it done.

## 1. What the token is

A compact JWS (RFC 7515) of a JWT (RFC 7519), signed **ES256** (ECDSA P-256 with SHA-256).
No other algorithm is ever used.

Header:

```json
{ "alg": "ES256", "typ": "air-customer+jwt", "kid": "brightcart-dev-1" }
```

Payload:

```json
{
  "iss": "air-web-console-dev",
  "aud": "air-orchestrator-service",
  "sub": "cust_1001",
  "air_tenant": "brightcart",
  "iat": 1763114531,
  "exp": 1763115131,
  "jti": "9f2c4e1a7b3d4c5e8f90a1b2c3d4e5f6"
}
```

Rules the orchestrator will enforce, so the console must always meet them:
- `exp − iat` ≤ 900 seconds (default here: 600);
- `iat` is the current time, never in the future;
- `sub` matches `^[A-Za-z0-9_.:-]{1,128}$`;
- `air_tenant` equals the tenant of the orchestrator API key sent with it. The `local` target's
  customer key `airo_local_customer_key` is tenant `brightcart`;
- `jti` is random (16 random bytes, hex), fresh for every token.

**Mint a new token for every proxied request.** No caching, no reuse: it costs microseconds,
and an expired token can then never be sent by accident.

**Header carrying it:** `air-token: <compact JWS>` (spec 0014, `REQ-CTK-001`: the name existing AIR
applications already use; header names are case-insensitive).

## 2. Configuration (server-side only)

New per-target fields, following the existing `AIR_WEB__TARGETS__<NAME>__<FIELD>` pattern
parsed by `src/lib/config.ts`'s `loadDefaults()`:

| Field | Example (`local`) | Meaning |
|---|---|---|
| `ORCHESTRATOR_CUSTOMER_TOKEN_PRIVATE_KEY` | PEM, PKCS#8, P-256 (`\n`-escaped in `.env`) | The signing key. Secret. Never leaves the server |
| `ORCHESTRATOR_CUSTOMER_TOKEN_KID` | `brightcart-dev-1` | Header `kid` |
| `ORCHESTRATOR_CUSTOMER_TOKEN_ISSUER` | `air-web-console-dev` | `iss` |
| `ORCHESTRATOR_CUSTOMER_TOKEN_TENANT` | `brightcart` | `air_tenant` |
| `ORCHESTRATOR_CUSTOMER_TOKEN_TTL_S` | `600` | Clamped server-side to `[60, 900]` |
| `ORCHESTRATOR_CUSTOMER_TOKEN_SUBJECTS` | `cust_1001,cust_1002` | The customers a tester may act as on this target. Each must match the `sub` pattern |

Feature on/off: a target **offers customer tokens** only when the private key, kid, issuer,
tenant and at least one subject are all set, and the private key parses as a P-256 private
key. A half-configured target is a startup or config error, reported the way other config
errors are. It never mints silently with defaults.

`toPublicDefaults()` gains, per target, only:
- `orchestrator_customer_token_configured: boolean`;
- `orchestrator_customer_subjects: string[]`. Customer ids are not secret, and the UI needs
  them for the picker.

The key, kid, issuer and tenant are not exposed.

**Development key pair.** Add `scripts/gen-customer-token-key.mjs` (`make customer-token-key`)
that uses `node:crypto` `generateKeyPairSync("ec", { namedCurve: "P-256" })` and prints:
1. the private key as PKCS#8 PEM, escaped for one `.env` line;
2. the public key as SPKI PEM;
3. the public key as a JWK, with `kid`, `alg: "ES256"` and `use: "sig"`.

Run it once. Put the private key in `.env.example` under the `local` target, with a comment
saying **development only, never used outside local, the orchestrator's `.env.example` holds
its public half**. This is the same footing as the committed `airo_local_*` development keys.
Report the public PEM and JWK to the user in your final message (§7): the orchestrator needs
them to verify.

## 3. How a request carries it

1. **Browser → BFF.** On the Orchestrator tab, customer channel only, the client adds
   `X-Target-Customer: <subject>` when a customer is picked. Nothing is added for
   "Anonymous". This joins `X-Target-Name` and `X-Target-Channel` as the only
   connection-shaped headers the BFF reads. Add it to the list in `CLAUDE.md`.
2. **BFF (`src/app/api/_lib/serviceProxy.ts`).** For service `orchestrator`, channel
   `customer`, and a target offering customer tokens:
   - if `X-Target-Customer` is present and in the target's `SUBJECTS`, mint a token for it
     and pass it to `forwardRequest` / `forwardStreamRequest`;
   - if it is present but not in the list, return an `Exchange` with `error` set ("customer
     not configured for this target"), and make no upstream call. This mirrors how a missing
     base URL is handled. Never mint for an arbitrary client-supplied subject: the server
     resolves, the client only names;
   - if it is absent, send no token: an anonymous customer.

   For any other service or channel, `X-Target-Customer` is ignored and no token is ever
   minted. On the business channel the orchestrator ignores a token anyway, but the console
   shouldn't send one.
3. **`src/lib/http/proxy.ts`.** `buildHeaders` takes an optional `customerToken` and sets
   `air-token` when present. Minting does not happen inside `proxy.ts`; it happens
   in a new server-only module (below), so `proxy.ts` stays transport only.
4. **Masking.** `masked()` in `serviceProxy.ts` masks `air-token` in
   `requestHeaders` exactly as it masks `X-API-Key`, on both the collected and the live
   transports. The rendered cURL (`exchange.ts`) shows it masked. The response pane may show
   the decoded, non-secret claims instead (§4), but never the compact token.

**New module:** `src/lib/auth/customerToken.ts`, starting with `import "server-only"`.
- `mintCustomerToken(config, subject, now = Date.now()): Promise<string>`;
- `decodeClaimsForDisplay(token): {sub, air_tenant, iss, kid, iat, exp}`. Use it on the
  server only, to attach a display summary to the `Exchange`.

Use **`jose`** (panva/jose, current 6.x, exact version pinned in `package.json`) for
`SignJWT` with `setProtectedHeader({ alg: "ES256", typ: "air-customer+jwt", kid })`, and
`importPKCS8` for the key. Import the key once per config load and cache the `KeyLike`;
never re-parse it per request.

## 4. UI (Orchestrator tab, customer channel)

- A **Customer** select beside the channel control: `Anonymous` (default) plus the target's
  `orchestrator_customer_subjects`.
  - Disabled, with a tooltip "This target has no customer token configured", when
    `orchestrator_customer_token_configured` is false.
  - Hidden on the business channel.
- Persist the choice per target in the existing Zustand connection store (the
  `air-web-console` storage-key prefix), so switching targets doesn't carry one target's
  customer to another.
- The request summary says plainly who the request is for: `as customer cust_1001 (token
  minted by the console, expires in 10 min)`, or `as an anonymous customer`. Use the BFF's
  display claims (`Exchange.customerToken?: {sub, tenant, issuer, kid, expiresAt}`). Add the
  field to the shared `Exchange` type, optional, so other tabs are unaffected.
- **Test modes for SIT**, a small `Token` select shown only in development (`APP_ENV` or
  `NODE_ENV !== "production"`):
  - `valid` (default);
  - `expired` (`iat` = now − 1200, `exp` = now − 600);
  - `wrong tenant` (`air_tenant` = `othershop`);
  - `tampered` (valid token with one payload character changed after signing).

  The client sends `X-Target-Customer-Token-Mode`, and the BFF applies it server-side from a
  fixed list; unknown values mean `valid`. These exist to check that the orchestrator refuses
  each with the same `401`. Never offer them on a production target.

## 5. Tests (vitest)

1. Minting: the token verifies with the matching public key (`jose.jwtVerify` with
   `algorithms: ["ES256"]`, `audience`, `issuer`).
   - The header is exactly `{alg, typ, kid}`.
   - The claims match §1.
   - `exp − iat` equals the TTL.
   - Two mints give different `jti`s.
2. The TTL is clamped to `[60, 900]`.
3. A half-configured target (for example, no subjects, or a non-P-256 key) is reported as a
   config error and never mints.
4. `toPublicDefaults()` exposes `orchestrator_customer_token_configured` and the subjects
   list, and contains no PEM, kid, issuer or tenant. Assert the serialised JSON contains no
   `BEGIN` and no private-key material.
5. Proxy, orchestrator customer channel with a picked subject: the upstream request (stub
   `undici`, as the existing proxy tests do) carries `air-token` and `X-API-Key`.
6. The header is absent for: anonymous; business channel; the classifier, model-gateway and
   RAG services; and a target without a token config.
7. A subject not in the target's list gives an `Exchange` with `error` and no upstream call.
8. The returned `Exchange` (collected **and** live/NDJSON) has the token masked in
   `requestHeaders` and the cURL text. The compact token's three segments appear nowhere in
   the serialised `Exchange`.
9. Each test mode produces what it says: `expired` fails `jwtVerify` with an expiry error,
   `wrong tenant` carries `othershop`, `tampered` fails signature verification. Modes are
   ignored when not in development.
10. A UI test: the Customer select lists the subjects, is hidden on business, is disabled
    without config, and the choice persists per target.

## 6. Docs

- README: a short section "Chatting as a customer", covering what the token is, that the
  console mints it server-side, how to add customers to a target, and how to generate a key
  pair for a new target.
- `CLAUDE.md`:
  - the BFF bullet list gains `X-Target-Customer` (and the dev-only mode header) as
    client-named, server-resolved inputs;
  - a line saying the signing key is an upstream credential like an API key.
- `.env.example`: the `local` target's six fields, with the development key, and commented
  QA examples with empty values.

## 7. Done means, and what to report back

- `make check` and `npm run build` pass.
- With the orchestrator running (`make run` there, :8081), a chat as `cust_1001` succeeds.
  The orchestrator ignores the header until spec 0014 is built. The console's request pane
  shows "as customer cust_1001" with the header masked.
- Your final message to the user, for the air-orchestrator-service session, contains:
  1. the **public key** for `kid` `brightcart-dev-1`, both as SPKI PEM and as JWK;
  2. the exact `iss` (`air-web-console-dev`), `aud`, tenant and subjects configured;
  3. the header name as implemented (`air-token`);
  4. any question or deviation from spec 0014's format, quoting the line it concerns.
