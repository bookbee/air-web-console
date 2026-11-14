/**
 * The Tools Gateway tab's simulations, run headless: every row of
 * `src/components/tools/data.ts`'s SIMULATIONS, judged exactly as the UI
 * judges them.
 *
 * Run with `make tools-check` (console must be serving). Steps the BFF can
 * send go through it, like the UI, so the BFF picks the read or execute key
 * from the route. *Headless* steps can't: they choose a key (none, a made-up
 * one, the wrong scope, another tenant's) or send a body that isn't JSON, so
 * this harness sends them straight to the gateway. The browser never gets
 * that path; this is a test process on the developer's machine, reading the
 * same `.env.local` the BFF reads, plus the gateway's documented development
 * keys for the second tenant.
 *
 * Writes (the conversation rows) run only where the gateway serves its
 * fixtures (a local target) unless TOOLS_ALLOW_WRITES=1. They use up 55120
 * and 70011 until the gateway restarts; a second run skips them, it doesn't
 * fail them. Fails when any contract row fails. Writes
 * bugs/tools-gateway/last-run-<target>.txt.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { expect, it } from "vitest";

import { newContext, runSimulation, SIMULATIONS, tally, type DirectAuth, type SimOutcome, type StepRequest } from "@/components/tools/data";
import type { Exchange } from "@/lib/http/exchange";

const CONSOLE = process.env.CONSOLE_URL ?? "http://127.0.0.1:3000";
const TARGET = process.env.TOOLS_TARGET ?? "local";
const TOKEN = process.env.AIR_WEB__GATEWAY_TOKEN ?? "";
const REPORT = process.env.REPORT ?? `bugs/tools-gateway/last-run-${TARGET}.txt`;
const LOCAL = TARGET === "local";
const field = (name: string) => process.env[`AIR_WEB__TARGETS__${TARGET.toUpperCase()}__${name}`] ?? "";
const DIRECT_URL = (process.env.TOOLS_DIRECT_URL || field("TOOLS_BASE_URL") || (LOCAL ? "http://127.0.0.1:8084" : "")).replace(/\/+$/, "");
const FIXTURE = process.env.TOOLS_FIXTURE ? process.env.TOOLS_FIXTURE === "1" : LOCAL;
const ALLOW_WRITES = process.env.TOOLS_ALLOW_WRITES === "1" || FIXTURE;

/** The keys a headless step may choose. The second tenant's are the
 * gateway's own documented development keys (its CLAUDE.md), local only. */
const KEYS: Record<DirectAuth, string> = {
  none: "",
  invalid: "airtg_not_a_real_key",
  read: field("TOOLS_READ_API_KEY") || (LOCAL ? "airtg_read_local_dev" : ""),
  execute: field("TOOLS_EXECUTE_API_KEY") || (LOCAL ? "airtg_exec_local_dev" : ""),
  "othershop-read": process.env.TOOLS_OTHER_TENANT_READ_KEY || (LOCAL ? "airtg_read_othershop_dev" : ""),
  "othershop-execute": process.env.TOOLS_OTHER_TENANT_EXECUTE_KEY || (LOCAL ? "airtg_exec_othershop_dev" : ""),
};

async function viaConsole(request: StepRequest): Promise<Exchange> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Target-Name": TARGET,
    "X-Target-Timeout-Seconds": "60",
  };
  if (request.idempotencyKey !== undefined) headers["Idempotency-Key"] = request.idempotencyKey;
  const response = await fetch(`${CONSOLE}/api/tools${request.path}`, {
    method: request.method,
    headers,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  if (response.status === 401) throw new Error("console rejected the gateway token: set AIR_WEB__GATEWAY_TOKEN");
  return (await response.json()) as Exchange;
}

let directCount = 0;

/** Straight to the gateway, recorded as the same Exchange shape the BFF
 * returns (the key masked), so `judge` reads it identically. */
async function direct(request: StepRequest): Promise<Exchange> {
  const auth = request.auth ?? "read";
  const key = KEYS[auth];
  if (!DIRECT_URL) throw new Error(`no base URL for ${TARGET}: set TOOLS_DIRECT_URL`);
  if (auth !== "none" && !key) throw new Error(`SKIP: no ${auth} key for ${TARGET}`);
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (key) headers["X-API-Key"] = key;
  if (request.idempotencyKey !== undefined) headers["Idempotency-Key"] = request.idempotencyKey;
  headers["X-Request-ID"] = `tools_check_${++directCount}`;
  const body = request.rawBody ?? (request.body === undefined ? undefined : JSON.stringify(request.body));
  const url = `${DIRECT_URL}${request.path}`;
  const started = performance.now();
  const exchange: Exchange = {
    method: request.method,
    url,
    requestHeaders: { ...headers, ...(key ? { "X-API-Key": "••••" } : {}) },
    requestBody: body ?? null,
    statusCode: null,
    reason: "",
    responseHeaders: {},
    responseJson: null,
    responseText: "",
    elapsedMs: 0,
    error: null,
    isStream: false,
    events: [],
  };
  try {
    const response = await fetch(url, { method: request.method, headers, body, signal: AbortSignal.timeout(60_000) });
    exchange.statusCode = response.status;
    exchange.reason = response.statusText;
    response.headers.forEach((value, name) => {
      exchange.responseHeaders[name] = value;
    });
    exchange.responseText = await response.text();
    try {
      exchange.responseJson = exchange.responseText ? JSON.parse(exchange.responseText) : null;
    } catch {
      exchange.responseJson = null;
    }
  } catch (error) {
    exchange.error = `Could not connect to ${url}: ${error instanceof Error ? error.message : String(error)}`;
  }
  exchange.elapsedMs = performance.now() - started;
  return exchange;
}

/** Whether the mirrored fixtures still match the gateway's own. */
function fixtureDrift(): string {
  const notes: string[] = [];
  for (const tenant of ["brightcart", "othershop"]) {
    const sibling = `../air-tools-gateway/fixtures/${tenant}/orders.json`;
    const mirror = `src/components/tools/fixtures/${tenant}-orders.json`;
    if (!existsSync(sibling)) notes.push(`${sibling} not found: judged against the mirror only`);
    else if (readFileSync(sibling, "utf8") !== readFileSync(mirror, "utf8")) notes.push(`DRIFT: ${mirror} differs from ${sibling}; copy it over`);
  }
  return notes.length ? notes.join(" · ") : "fixtures match ../air-tools-gateway/fixtures";
}

it("air-tools-gateway meets its contract", async () => {
  const health = await viaConsole({ method: "GET", path: "/v1/health" });
  const rows: string[] = [];
  const outcomes: SimOutcome[] = [];

  for (const simulation of SIMULATIONS) {
    if (simulation.mutates && !ALLOW_WRITES) {
      rows.push(`${"SKIP".padEnd(7)} ${simulation.group.padEnd(22)} ${simulation.id.padEnd(24)} writes: set TOOLS_ALLOW_WRITES=1 to run on ${TARGET}`);
      continue;
    }
    const send = simulation.direct ? direct : (request: StepRequest) => (request.auth || request.rawBody ? direct(request) : viaConsole(request));
    let outcome: SimOutcome;
    try {
      outcome = await runSimulation(simulation, send, newContext(FIXTURE));
    } catch (error) {
      outcome = { simulation, steps: [], failure: String(error), skipped: null };
    }
    const skipKey = outcome.failure?.match(/SKIP: (.*)$/);
    if (skipKey) outcome = { ...outcome, failure: null, skipped: skipKey[1] };
    outcomes.push(outcome);

    const gap = simulation.group === "known gaps";
    const verdict = outcome.skipped ? "SKIP" : outcome.failure === null ? (gap ? "FIXED?" : "PASS") : gap ? "OPEN" : "FAIL";
    const statuses = outcome.steps.flatMap((s) => s.exchanges.map((x) => x.statusCode ?? "ERR")).join(",");
    const how = simulation.direct ? "direct" : "bff";
    rows.push(
      `${verdict.padEnd(7)} ${simulation.group.padEnd(22)} ${simulation.id.padEnd(24)} ${how.padEnd(6)} [${statuses}] ${simulation.bug ?? ""} ${outcome.skipped ?? outcome.failure ?? ""}`.trimEnd(),
    );
  }

  const counts = tally(outcomes);
  const report = [
    `air-tools-gateway simulation run · ${new Date().toISOString()}`,
    `console ${CONSOLE} · target ${TARGET} · gateway ${health.url.replace(/\/v1\/health$/, "")} · direct ${DIRECT_URL || "—"}`,
    `health ${JSON.stringify(health.responseJson) ?? health.error} · fixture checks ${FIXTURE ? "on" : "off"} · writes ${ALLOW_WRITES ? "on" : "off"}`,
    fixtureDrift(),
    "",
    ...rows,
    "",
    `contract ${counts.passed}/${counts.total} passed · skipped ${counts.skipped} · known gaps open ${counts.gapsOpen}` +
      (counts.gapsFixed.length ? ` · now passing (verify, then move out of known gaps): ${counts.gapsFixed.join(", ")}` : ""),
    "",
  ].join("\n");
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, report);
  process.stdout.write(`\n${report}\nreport written to ${REPORT}\n`);

  expect(counts.passed, "contract simulations failed; see the report").toBe(counts.total);
});
