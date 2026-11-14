import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Exchange } from "@/lib/http/exchange";
import type { PublicTarget } from "@/lib/types";
import { buildConnections, useConnectionStore } from "@/store/connectionStore";
import { buildMuiTheme } from "@/theme/muiTheme";

import { OrchestratorTab } from "../OrchestratorTab";

function target(name: string, overrides: Partial<PublicTarget> = {}): PublicTarget {
  return {
    name,
    label: name.toUpperCase(),
    classifierBaseUrl: "",
    classifierKeyed: false,
    orchestratorBaseUrl: "http://127.0.0.1:8081",
    orchestratorCustomerKeyed: true,
    orchestratorBusinessKeyed: true,
    llmBaseUrl: "",
    llmKeyed: false,
    ragBaseUrl: "",
    ragKeyed: false,
    orchestratorCustomerTokenConfigured: true,
    orchestratorCustomerSubjects: ["cust_1001", "cust_1002"],
    orchestratorCustomerTokenError: null,
    orchestratorCustomerTokenTestModes: false,
    ...overrides,
  };
}

const TARGETS = {
  local: target("local"),
  qa: target("qa", { orchestratorCustomerTokenConfigured: false, orchestratorCustomerSubjects: [] }),
  other: target("other", { orchestratorCustomerSubjects: ["cust_2001"] }),
};

function renderTab() {
  const state = useConnectionStore.getState();
  const connections = buildConnections(state);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={buildMuiTheme("light")}>
        <OrchestratorTab chat={connections.orchestratorChat} query={connections.orchestratorQuery} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function openCustomerSelect() {
  const control = screen.getByTestId("customer-select").parentElement!;
  fireEvent.mouseDown(within(control).getByRole("combobox"));
  return screen.getByRole("listbox");
}

beforeEach(() => {
  useConnectionStore.setState({ targets: TARGETS, selectedTarget: "local", customerByTarget: {}, hydrated: true });
});
afterEach(() => vi.unstubAllGlobals());

/** What the BFF answers for a chat sent as cust_1001: the token masked, its
 * display claims beside it. */
const SENT_AS_CUST_1001: Exchange = {
  method: "POST",
  url: "http://127.0.0.1:8081/v1/chat",
  requestHeaders: { "X-API-Key": "••••••••", "air-token": "••••••••" },
  requestBody: { message: "Where is my order?" },
  statusCode: 200,
  reason: "OK",
  responseHeaders: { "content-type": "application/json" },
  responseJson: { turn_id: "turn_1", session_id: "sess_1", answer: "Could you give me your order number?" },
  responseText: "",
  elapsedMs: 120,
  error: null,
  isStream: false,
  events: [],
  customerToken: {
    sub: "cust_1001",
    tenant: "brightcart",
    issuer: "air-web-console-dev",
    kid: "brightcart-dev-1",
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    mode: "valid",
  },
};

// Renders the whole Orchestrator tab (MUI included); its first, cold render
// can pass Vitest's 5s default when the full suite runs files in parallel.
describe("Customer picker", { timeout: 30_000 }, () => {
  it("lists Anonymous plus the target's customers", () => {
    renderTab();
    const options = within(openCustomerSelect()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Anonymous", "cust_1001", "cust_1002"]);
  });

  it("is hidden on the business channel", () => {
    renderTab();
    expect(screen.getByTestId("customer-select")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Query"));
    expect(screen.queryByTestId("customer-select")).not.toBeInTheDocument();
  });

  it("is disabled where the target has no customer token configured", () => {
    useConnectionStore.setState({ selectedTarget: "qa" });
    renderTab();
    const control = screen.getByTestId("customer-select").parentElement!;
    expect(within(control).getByRole("combobox")).toHaveAttribute("aria-disabled", "true");
  });

  it("remembers the pick per target, and sends it only on that target", () => {
    renderTab();
    fireEvent.click(within(openCustomerSelect()).getByText("cust_1002"));
    expect(useConnectionStore.getState().customerByTarget).toEqual({ local: "cust_1002" });
    expect(buildConnections(useConnectionStore.getState()).orchestratorChat.customer).toBe("cust_1002");

    useConnectionStore.getState().selectTarget("other");
    expect(buildConnections(useConnectionStore.getState()).orchestratorChat.customer).toBeUndefined();
    useConnectionStore.getState().selectTarget("local");
    expect(buildConnections(useConnectionStore.getState()).orchestratorChat.customer).toBe("cust_1002");
    expect(buildConnections(useConnectionStore.getState()).orchestratorQuery.customer).toBeUndefined();
  });

  it("refuses to store a customer the target doesn't list", () => {
    useConnectionStore.getState().setCustomer("local", "cust_9999");
    expect(useConnectionStore.getState().customerByTarget).toEqual({});
  });

  it("offers the token test modes only where the target allows them", () => {
    useConnectionStore.setState({
      targets: { ...TARGETS, local: target("local", { orchestratorCustomerTokenTestModes: true }) },
      customerByTarget: { local: "cust_1001" },
    });
    renderTab();
    expect(screen.getByTestId("token-mode-select")).toBeInTheDocument();
  });

  it("names the customer to the BFF and says who the response was for", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(SENT_AS_CUST_1001), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    useConnectionStore.setState({ customerByTarget: { local: "cust_1001" } });
    renderTab();
    fireEvent.change(screen.getByLabelText(/message · required/), { target: { value: "Where is my order?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect((await screen.findByTestId("customer-summary")).textContent).toMatch(
      /^Sent as customer cust_1001 \(token minted by the console, expires in (9|10) min\)\.$/,
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Target-Customer"]).toBe("cust_1001");
    expect(headers["X-Target-Channel"]).toBe("customer");
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("air-token");
  });
});
