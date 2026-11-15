import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Connection } from "@/lib/connection";
import type { Exchange } from "@/lib/http/exchange";
import { buildMuiTheme } from "@/theme/muiTheme";

import { ToolsTab } from "../ToolsTab";

const LOCAL: Connection = {
  service: "air-tools-gateway",
  target: "local",
  targetLabel: "Local",
  baseUrl: "http://127.0.0.1:8084",
  authenticated: true,
  executeKeyed: true,
  timeoutSeconds: 30,
};
const REMOTE: Connection = { ...LOCAL, target: "qa", targetLabel: "QA", baseUrl: "https://tools.qa.example.internal" };

function exchangeFor(path: string): Exchange {
  const proposal = { proposal_id: "gp_abc123abc123", capability: "orders.cancel", risk: "low", summary: "Cancel order 55120.", expires_at: "2026-11-15T10:10:00Z" };
  const inventory = { service: "air-tools-gateway", version: "0.1.0", capabilities: [{ name: "orders.cancel", kind: "write", risk: "low", version: 1, description: "Cancel.", requires_subject: true, input_schema: { type: "object", additionalProperties: false, properties: {} } }] };
  const body = path.endsWith("/propose")
    ? proposal
    : path.endsWith("/execute")
      ? { status: "done", execution_id: "gx_1", capability: "orders.cancel", result: {} }
      : path.endsWith("/v1/capabilities")
        ? inventory
        : { status: "ready", checks: [] };
  return {
    method: "POST",
    url: `http://127.0.0.1:8084${path}`,
    requestHeaders: {},
    requestBody: null,
    statusCode: 200,
    reason: "OK",
    responseHeaders: { "content-type": "application/json" },
    responseJson: body,
    responseText: JSON.stringify(body),
    elapsedMs: 1,
    error: null,
    isStream: false,
    events: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const path = String(input).replace(/^\/api\/tools/, "");
  return new Response(JSON.stringify(exchangeFor(path)), { status: 200, headers: { "content-type": "application/json" } });
});
const calls = (suffix: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix));

function renderTab(connection: Connection) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={buildMuiTheme("light")}>
        <ToolsTab connection={connection} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

// Renders the whole tab (MUI included): its first, cold render can pass
// Vitest's 5s default when the full suite runs files in parallel.
describe("Tools Gateway tab", { timeout: 30_000 }, () => {
  it("refuses execute where the target has no execute key", () => {
    renderTab({ ...LOCAL, executeKeyed: false });
    fireEvent.click(screen.getByLabelText("Execute · execute key"));
    expect(screen.getByText(/no execute key configured/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Execute" })).toBeDisabled();
  });

  it("turns a proposal into an execute with Confirm", async () => {
    renderTab(LOCAL);
    fireEvent.click(screen.getByLabelText("Propose · changes nothing"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByTestId("confirm-proposal"));
    expect(screen.getByLabelText("proposal_id")).toHaveValue("gp_abc123abc123");
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    await waitFor(() => expect(calls("/execute")).toHaveLength(1));
    const init = calls("/execute")[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/);
    expect(JSON.parse(String(init.body))).toEqual({ proposal_id: "gp_abc123abc123", subject: "cust_1001" });
  });

  it("asks before executing on a remote target, and sends nothing until confirmed", async () => {
    renderTab(REMOTE);
    fireEvent.click(screen.getByLabelText("Execute · execute key"));
    fireEvent.change(screen.getByLabelText("proposal_id"), { target: { value: "gp_abc123abc123" } });
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    const dialog = await screen.findByTestId("confirm-write");
    expect(dialog).toHaveTextContent("tools.qa.example.internal");
    expect(calls("/execute")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByTestId("confirm-write")).not.toBeInTheDocument());
    expect(calls("/execute")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    fireEvent.click(within(await screen.findByTestId("confirm-write")).getByRole("button", { name: "Execute" }));
    await waitFor(() => expect(calls("/execute")).toHaveLength(1));
  });

  it("reports, rather than crashes on, a 200 that isn't an inventory", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input).replace(/^\/api\/tools/, "");
      const x = exchangeFor(path);
      if (path.endsWith("/v1/capabilities")) x.responseJson = { status: "ready" };
      return new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });
    });
    renderTab(LOCAL);
    const label = await screen.findByText(/The inventory breaks the contract/);
    expect(label.closest('[role="alert"]')).toHaveTextContent("no capabilities array");
  });

  it("leaves writes out of Run all on a remote target", () => {
    renderTab(REMOTE);
    expect(screen.getByRole("button", { name: "Run all" })).toBeEnabled();
    expect(screen.getByText(/leaves out every write/)).toBeInTheDocument();
  });
});
