/**
 * The Model Gateway tab's contract scenarios, run headless: every row of
 * `src/components/llm/data.ts`'s SCENARIOS, sent through this console's BFF
 * to the target's air-model-gateway and judged exactly as the UI judges it.
 *
 * Run with `make gateway-check` (console must be serving). Fails when any
 * contract row fails. Known gaps are reported, not failed on: one that now
 * passes means its fix landed and should be verified and moved out of the
 * group (see bugs/README.md). Writes a plain-text report next to the bug
 * reports, so the result can be attached to a handover or a verification.
 */

import { writeFileSync } from "node:fs";

import { expect, it } from "vitest";

import { expectationFor, judge, SCENARIOS, tally } from "@/components/llm/data";
import type { Exchange } from "@/lib/http/exchange";

const CONSOLE = process.env.CONSOLE_URL ?? "http://127.0.0.1:3000";
const TARGET = process.env.GATEWAY_TARGET ?? "local";
const TOKEN = process.env.AIR_WEB__GATEWAY_TOKEN ?? "";
const REPORT = process.env.REPORT ?? `bugs/model-gateway/last-run-${TARGET}.txt`;

async function send(path: string, method: string, body?: unknown, stream?: boolean): Promise<Exchange> {
  const response = await fetch(`${CONSOLE}/api/llm${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: stream ? "text/event-stream" : "application/json",
      "X-Target-Name": TARGET,
      "X-Target-Timeout-Seconds": "90",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) throw new Error("console rejected the gateway token: set AIR_WEB__GATEWAY_TOKEN");
  return (await response.json()) as Exchange;
}

it("air-model-gateway meets its contract", async () => {
  const health = await send("/v1/health", "GET");
  const capabilities = await send("/v1/capabilities", "GET");
  const environment = String((capabilities.responseJson as { environment?: string } | null)?.environment ?? "local");

  const rows: string[] = [];
  const results = [];
  for (const scenario of SCENARIOS) {
    let exchange = await send(scenario.path, scenario.method, scenario.body, scenario.stream);
    if (scenario.repeat && !exchange.error) exchange = await send(scenario.path, scenario.method, scenario.body, scenario.stream);
    const failure = judge(exchange, expectationFor(scenario, environment));
    results.push({ scenario, failure });
    const isGap = scenario.group === "known gaps";
    const verdict = failure === null ? (isGap ? "FIXED?" : "PASS") : isGap ? "OPEN" : "FAIL";
    rows.push(`${verdict.padEnd(7)} ${scenario.group.padEnd(15)} ${scenario.id.padEnd(30)} ${scenario.bug ?? ""} ${failure ?? ""}`.trimEnd());
  }

  const counts = tally(results);
  const report = [
    `air-model-gateway contract run · ${new Date().toISOString()}`,
    `console ${CONSOLE} · target ${TARGET} · gateway ${capabilities.url.replace(/\/v1\/capabilities$/, "")}`,
    `gateway reports environment ${environment} · health ${JSON.stringify(health.responseJson)}`,
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
