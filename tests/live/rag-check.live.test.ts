/**
 * The RAG tab's contract and SIT scenarios, run headless: every row of
 * `src/components/rag/data.ts`'s SCENARIOS, judged exactly as the UI judges it.
 *
 * Run with `make rag-check` (console must be serving). Rows the BFF can send
 * go through it, like the UI. *Headless* rows can't (no key, a wrong key, a
 * body that isn't JSON, a chosen X-Request-ID: the BFF always attaches the
 * target's key and its own id), so this harness sends them straight to the
 * service, the same way `../air-rag-service/scripts/sit_check.py` does. The
 * browser never gets that path; this is a test process on the developer's
 * machine, reading the same `.env.local` the BFF reads.
 *
 * Operator rows run only with `RAG_OPERATOR=gateway-down` (air-model-gateway
 * stopped first), and then only they run. Fails when any contract row fails;
 * known gaps are reported, not failed on. Writes bugs/rag/last-run-<target>.txt.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { expect, it } from "vitest";

import {
  DEFAULT_TENANT,
  judge,
  preflightFailure,
  SCENARIOS,
  tally,
  type Direct,
  type RunContext,
  type Scenario,
} from "@/components/rag/data";
import type { Exchange } from "@/lib/http/exchange";

const CONSOLE = process.env.CONSOLE_URL ?? "http://127.0.0.1:3000";
const TARGET = process.env.RAG_TARGET ?? "local";
const TOKEN = process.env.AIR_WEB__GATEWAY_TOKEN ?? "";
const REPORT = process.env.REPORT ?? `bugs/rag/last-run-${TARGET}.txt`;
const OPERATOR = process.env.RAG_OPERATOR ?? "";
const field = (name: string) => process.env[`AIR_WEB__TARGETS__${TARGET.toUpperCase()}__${name}`] ?? "";
const DIRECT_URL = (process.env.RAG_DIRECT_URL || field("RAG_BASE_URL") || (TARGET === "local" ? "http://127.0.0.1:8087" : "")).replace(/\/+$/, "");
const DIRECT_KEY = field("RAG_API_KEY") || (TARGET === "local" ? "airr_local_dev_key" : "");
const SCOPED_KEY = process.env.RAG_SCOPED_KEY ?? "";
const SIBLING_QUERIES = "../air-rag-service/sit/queries.json";
const MIRROR_QUERIES = "src/components/rag/sit-queries.json";

async function viaConsole(scenario: Pick<Scenario, "path" | "method" | "body">): Promise<Exchange> {
  const response = await fetch(`${CONSOLE}/api/rag${scenario.path}`, {
    method: scenario.method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Target-Name": TARGET,
      "X-Target-Timeout-Seconds": "60",
    },
    body: scenario.body === undefined ? undefined : JSON.stringify(scenario.body),
  });
  if (response.status === 401) throw new Error("console rejected the gateway token: set AIR_WEB__GATEWAY_TOKEN");
  return (await response.json()) as Exchange;
}

/** Straight to the service, recorded as the same Exchange shape the BFF returns
 * (the key masked), so `judge` reads it identically. */
async function direct(scenario: Scenario, how: Direct): Promise<Exchange | string> {
  if (!DIRECT_URL) return `no base URL for ${TARGET}: set RAG_DIRECT_URL`;
  const key = how.auth === "key" ? DIRECT_KEY : how.auth === "scoped" ? SCOPED_KEY : how.auth === "invalid" ? "airr_not_a_real_key" : "";
  if (how.auth === "scoped" && !key) return "SKIP";
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (key) headers["X-API-Key"] = key;
  headers["X-Request-ID"] = how.requestId ?? `rag_check_${scenario.id.replace(/[^A-Za-z0-9]/g, "_")}`;
  const body = how.rawBody ?? (scenario.body === undefined ? undefined : JSON.stringify(scenario.body));
  const url = `${DIRECT_URL}${scenario.path}`;
  const started = performance.now();
  const exchange: Exchange = {
    method: scenario.method,
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
    const response = await fetch(url, { method: scenario.method, headers, body, signal: AbortSignal.timeout(60_000) });
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

/** Whether the mirrored query set still matches the service's own. */
function queryDrift(): string {
  if (!existsSync(SIBLING_QUERIES)) return `sibling ${SIBLING_QUERIES} not found: judged against the mirror only`;
  const same = readFileSync(SIBLING_QUERIES, "utf8") === readFileSync(MIRROR_QUERIES, "utf8");
  return same ? "query set matches ../air-rag-service/sit/queries.json" : `DRIFT: ${MIRROR_QUERIES} differs from ${SIBLING_QUERIES}; copy it over`;
}

it("air-rag-service meets its contract and the SIT query set", async () => {
  const health = await viaConsole({ path: "/v1/health", method: "GET" });
  const capabilities = await viaConsole({ path: "/v1/capabilities", method: "GET" });
  const caps = (capabilities.responseJson ?? {}) as Record<string, unknown>;
  const context: RunContext = { tenant: typeof caps.tenant === "string" ? caps.tenant : DEFAULT_TENANT };
  const empty = capabilities.statusCode === 200 ? preflightFailure(caps) : `capabilities answered ${capabilities.error ?? capabilities.statusCode}`;

  const rows: string[] = [];
  const results: { scenario: Scenario; failure: string | null }[] = [];
  for (const scenario of SCENARIOS) {
    const operatorRow = Boolean(scenario.operator);
    if (operatorRow !== (OPERATOR === "gateway-down")) {
      if (operatorRow) rows.push(`${"MANUAL".padEnd(7)} ${scenario.group.padEnd(16)} ${scenario.id.padEnd(28)} RAG_OPERATOR=gateway-down, after: ${scenario.operator}`);
      continue;
    }
    let failure: string | null;
    let status = "";
    if (scenario.sit && empty && !operatorRow) {
      failure = empty;
    } else {
      const exchange = scenario.direct ? await direct(scenario, scenario.direct) : await viaConsole(scenario);
      if (exchange === "SKIP") {
        rows.push(`${"SKIP".padEnd(7)} ${scenario.group.padEnd(16)} ${scenario.id.padEnd(28)} set RAG_SCOPED_KEY to a retrieval:read-only key`);
        continue;
      }
      if (typeof exchange === "string") {
        failure = exchange;
      } else {
        failure = judge(exchange, scenario.expected, context);
        status = exchange.statusCode === null ? "" : `[${exchange.statusCode}]`;
      }
    }
    results.push({ scenario, failure });
    const isGap = scenario.group === "known gaps";
    const verdict = failure === null ? (isGap ? "FIXED?" : "PASS") : isGap ? "OPEN" : "FAIL";
    const how = scenario.direct ? "direct" : "bff";
    rows.push(
      `${verdict.padEnd(7)} ${scenario.group.padEnd(16)} ${scenario.id.padEnd(28)} ${how.padEnd(6)} ${status.padEnd(5)} ${scenario.bug ?? ""} ${failure ?? ""}`.trimEnd(),
    );
  }

  const counts = tally(results);
  const report = [
    `air-rag-service contract + SIT run · ${new Date().toISOString()}`,
    `console ${CONSOLE} · target ${TARGET} · rag ${capabilities.url.replace(/\/v1\/capabilities$/, "")} · direct ${DIRECT_URL || "—"}`,
    `health ${JSON.stringify(health.responseJson)} · tenant ${context.tenant} · index ${empty ?? `${String(caps.document_count)} chunks`}`,
    queryDrift(),
    OPERATOR ? `operator mode: ${OPERATOR} (only operator rows ran)` : "",
    "",
    ...rows,
    "",
    `contract ${counts.contractPassed}/${counts.contractTotal} passed · known gaps open ${counts.gapsOpen}` +
      (counts.gapsFixed.length ? ` · now passing (verify, then move out of known gaps): ${counts.gapsFixed.join(", ")}` : ""),
    "",
  ].join("\n");
  writeFileSync(REPORT, report);
  process.stdout.write(`\n${report}\nreport written to ${REPORT}\n`);

  expect(counts.contractPassed, "contract scenarios failed; see the report").toBe(counts.contractTotal);
});
