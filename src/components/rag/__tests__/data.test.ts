import { describe, expect, it } from "vitest";

import type { Exchange } from "@/lib/http/exchange";

import {
  chunkOf,
  citationRows,
  EMPTY_INDEX,
  expectedLabel,
  isolationFailure,
  judge,
  judgeSitCase,
  preflightFailure,
  requestIdEchoFailure,
  SCENARIOS,
  shapeFailure,
  SIT_CASES,
  sitTopK,
  sourceOf,
  tally,
  viaConsole,
  type Citation,
} from "../data";
import { RAG_PRESETS } from "../demo";

const cite = (source: string, score: number, metadata: Record<string, unknown> = {}): Citation => ({
  source_id: `${source}#0`,
  snippet: `about ${source}`,
  score,
  metadata: { tenant: "brightcart", status: "active", source_id: source, ...metadata },
});

function exchange(over: Partial<Exchange>): Exchange {
  return {
    method: "POST",
    url: "http://127.0.0.1:8087/v1/retrieve",
    requestHeaders: { "X-Request-ID": "web_abc" },
    requestBody: null,
    statusCode: 200,
    reason: "OK",
    responseHeaders: { "content-type": "application/json", "x-request-id": "web_abc" },
    responseJson: { query: "q", citations: [] },
    responseText: "",
    elapsedMs: 5,
    error: null,
    isStream: false,
    events: [],
    ...over,
  };
}

const problem = (slug: string, status: number, extra: Record<string, unknown> = {}) =>
  exchange({
    statusCode: status,
    responseHeaders: { "content-type": "application/problem+json", "x-request-id": "web_abc" },
    responseJson: { type: `https://air.dev/problems/air-rag-service/${slug}`, status, request_id: "web_abc", errors: [], ...extra },
  });

const ctx = { tenant: "brightcart" };

describe("citation parsing", () => {
  it("reads the source from metadata, else from source_id before #", () => {
    expect(sourceOf({ source_id: "x#3", snippet: "", score: 0, metadata: { source_id: "returns-refunds" } })).toBe("returns-refunds");
    expect(sourceOf({ source_id: "gift-cards#2", snippet: "", score: 0 })).toBe("gift-cards");
    expect(chunkOf({ source_id: "gift-cards#2", snippet: "", score: 0 })).toBe("2");
    expect(chunkOf({ source_id: "gift-cards", snippet: "", score: 0 })).toBeNull();
  });

  it("ranks rows and flags each leak", () => {
    const rows = citationRows(
      { citations: [cite("returns-refunds", 0.8), cite("acme-returns", 0.7, { tenant: "acme" }), cite("returns-refunds-2024", 0.6, { status: "archived" })] },
      "brightcart",
    );
    expect(rows.map((r) => [r.rank, r.source, r.leak])).toEqual([
      [1, "returns-refunds", null],
      [2, "acme-returns", "tenant acme"],
      [3, "returns-refunds-2024", "status archived"],
    ]);
  });

  it("treats a non-retrieve body as no citations", () => {
    expect(citationRows(null, "brightcart")).toEqual([]);
    expect(citationRows({ citations: "nope" }, "brightcart")).toEqual([]);
  });
});

describe("isolation", () => {
  it("passes the key's own active citations, and an empty answer", () => {
    expect(isolationFailure({ citations: [cite("gift-cards", 0.5)] }, "brightcart")).toBeNull();
    expect(isolationFailure({ citations: [] }, "brightcart")).toBeNull();
  });

  it("fails another tenant, a missing tenant, and the never-seeded draft", () => {
    expect(isolationFailure({ citations: [cite("acme-returns", 0.5, { tenant: "acme" })] }, "brightcart")).toMatch(/tenant acme/);
    expect(isolationFailure({ citations: [cite("x", 0.5, { tenant: undefined })] }, "brightcart")).toMatch(/tenant missing/);
    expect(isolationFailure({ citations: [cite("draft-no-tenant", 0.5)] }, "brightcart")).toMatch(/never be cited/);
  });

  it("is applied by judge to every successful retrieve, whatever the row checks", () => {
    const leaky = exchange({ responseJson: { citations: [cite("acme-returns", 0.9, { tenant: "acme" })] } });
    expect(judge(leaky, { status: 200 }, ctx)).toMatch(/isolation leak/);
  });
});

describe("shape", () => {
  it("wants best-first scores in 0..1 with a snippet each", () => {
    expect(shapeFailure({ citations: [cite("a", 0.9), cite("b", 0.4)] })).toBeNull();
    expect(shapeFailure({ citations: [cite("a", 0.4), cite("b", 0.9)] })).toMatch(/outranks/);
    expect(shapeFailure({ citations: [cite("a", 1.2)] })).toMatch(/0\.\.1/);
    expect(shapeFailure({ citations: [{ source_id: "a", snippet: "x", score: 0.1 }] })).toMatch(/<doc>#<chunk>/);
    expect(shapeFailure({})).toBe("no citations array");
  });
});

describe("SIT cases", () => {
  it("mirrors the 29-case query set with the multilingual and near-duplicate cases", () => {
    expect(SIT_CASES).toHaveLength(29);
    expect(SIT_CASES.find((c) => c.query === "चाय कैफ़े")).toMatchObject({ expect: "tumbler-chai-cafe", within: 5 });
    expect(SIT_CASES.find((c) => c.forbid_top)).toMatchObject({ query: "current return window", forbid_top: "returns-refunds-2024" });
  });

  it("sends top_k max(within, 5), as sit_check.py does", () => {
    expect(sitTopK({ query: "", expect: "" })).toBe(5);
    expect(sitTopK({ query: "", expect: "", within: 8 })).toBe(8);
  });

  it("passes when expected is within the window and forbid_top isn't #1", () => {
    const body = { citations: [cite("exchanges", 0.6), cite("returns-refunds", 0.5)] };
    expect(judgeSitCase({ query: "", expect: "returns-refunds" }, body)).toBeNull();
    expect(judgeSitCase({ query: "", expect: "returns-refunds", within: 1 }, body)).toMatch(/at #2, not within 1/);
    expect(judgeSitCase({ query: "", expect: "gift-cards" }, body)).toMatch(/not cited \(top: exchanges\)/);
    expect(judgeSitCase({ query: "", expect: "returns-refunds", forbid_top: "exchanges" }, body)).toMatch(/exchanges ranked #1/);
  });

  it("needs a seeded index first", () => {
    expect(preflightFailure({ document_count: 0 })).toBe(EMPTY_INDEX);
    expect(preflightFailure({})).toBe(EMPTY_INDEX);
    expect(preflightFailure({ document_count: 41 })).toBeNull();
  });
});

describe("judge", () => {
  it("matches one status or any of several", () => {
    expect(judge(problem("validation-error", 422), { status: [400, 422] }, ctx)).toBeNull();
    expect(judge(problem("malformed-request", 400), { status: [400, 422] }, ctx)).toBeNull();
    expect(judge(problem("validation-error", 422), { status: 400 }, ctx)).toBe("got 422 validation-error");
    expect(expectedLabel({ status: [400, 422] })).toBe("400 or 422");
  });

  it("holds every error to problem+json under the service's type base", () => {
    expect(judge(problem("not-found", 404), { status: 404, slug: "not-found" }, ctx)).toBeNull();
    expect(judge(problem("not-found", 404), { status: 404, slug: "missing-api-key" }, ctx)).toBe("type not-found");
    const plain = exchange({ statusCode: 404, responseHeaders: { "content-type": "application/json" }, responseJson: { detail: "Not Found" } });
    expect(judge(plain, { status: 404 }, ctx)).toMatch(/not problem\+json/);
  });

  it("lets a readiness 503 be its report rather than a problem", () => {
    const notReady = exchange({ statusCode: 503, responseHeaders: { "content-type": "application/json" }, responseJson: { ready: false } });
    expect(judge(notReady, { status: 503 }, ctx)).toMatch(/not problem\+json/);
    expect(judge(notReady, { status: 503, problem: false }, ctx)).toBeNull();
    expect(SCENARIOS.find((s) => s.id === "gateway-down-ready")?.expected.problem).toBe(false);
  });

  it("reports a transport error as the failure", () => {
    expect(judge(exchange({ error: "Could not connect", statusCode: null }), { status: 200 }, ctx)).toBe("Could not connect");
  });

  it("checks the request id round trip", () => {
    expect(requestIdEchoFailure({ request_id: "web_abc" }, problem("validation-error", 422))).toBeNull();
    const lost = problem("validation-error", 422, { request_id: "req_other" });
    expect(requestIdEchoFailure(lost.responseJson as Record<string, unknown>, lost)).toMatch(/problem request_id/);
  });
});

describe("scenarios", () => {
  it("have unique ids, and every known gap that isn't a SIT case names its report", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS.filter((s) => s.group === "known gaps" && !s.sit)) expect(s.bug).toMatch(/^RG-\d{3}$/);
  });

  it("keep the BFF's limits: rows it can't send are headless", () => {
    for (const s of SCENARIOS) {
      if (s.direct?.auth === "none" || s.direct?.auth === "invalid" || s.direct?.rawBody) expect(viaConsole(s)).toBe(false);
    }
    expect(SCENARIOS.find((s) => s.id === "tenant-in-body")).toMatchObject({ body: { tenant: "acme" }, expected: { status: 422 } });
  });

  it("keep operator rows out of a plain run", () => {
    const operator = SCENARIOS.filter((s) => s.operator);
    expect(operator.map((s) => s.expected.status)).toEqual([200, 503, 503]);
  });

  it("tally a passing gap as fixed, not as a contract pass", () => {
    const gap = SCENARIOS.find((s) => s.bug === "RG-002")!;
    const contract = SCENARIOS.find((s) => s.id === "health")!;
    expect(tally([{ scenario: gap, failure: null }, { scenario: contract, failure: "x" }])).toEqual({
      contractPassed: 0,
      contractTotal: 1,
      gapsOpen: 0,
      gapsFixed: ["RG-002"],
    });
  });
});

describe("presets", () => {
  it("only fill the form: a query, or a raw body for a deliberate negative case", () => {
    for (const preset of RAG_PRESETS) expect(Boolean(preset.query) !== Boolean(preset.raw)).toBe(true);
    expect(RAG_PRESETS.find((p) => p.raw)?.raw).toHaveProperty("tenant");
  });
});
