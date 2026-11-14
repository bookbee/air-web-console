// Test-only stand-in for the `server-only` package, which throws when imported
// outside a React Server Component build. Aliased in vitest.config.mts only, so
// server modules (config, the proxy, the customer-token minter) can be unit
// tested; Next still enforces the real guard in every build.
export {};
