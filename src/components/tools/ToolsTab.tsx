"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { TargetCaption } from "@/components/layout/TargetBar";
import { JsonViewer } from "@/components/shared/JsonViewer";
import { ResponseView } from "@/components/shared/ResponseView";
import { RouteCard } from "@/components/shared/RouteCard";
import { SendRow } from "@/components/shared/SendRow";
import { useSendRequest } from "@/hooks/useSendRequest";
import { isRemote, type Connection } from "@/lib/connection";
import { sendViaProxy } from "@/lib/http/client";
import { joinUrl, type Exchange } from "@/lib/http/exchange";

import { ConfirmWrite } from "./ConfirmWrite";
import {
  capabilitiesFor,
  CUSTOMER,
  executePath,
  freshIdempotencyKey,
  IDEMPOTENCY_KEY,
  OTHER_CUSTOMER,
  proposePath,
  sampleArguments,
  toolPath,
  type Capability,
  type Inventory,
} from "./data";
import { SimulationPanel } from "./SimulationPanel";
import { ToolsStatus } from "./ToolsStatus";
import { ToolsSummary } from "./ToolsSummary";

type Mode = "tool" | "propose" | "execute";

const MODES: { key: Mode; label: string }[] = [
  { key: "tool", label: "Tool · read" },
  { key: "propose", label: "Propose · changes nothing" },
  { key: "execute", label: "Execute · execute key" },
];

/** One line per argument: `order_id (required, string ^[0-9]{4,12}$)`. */
function schemaLine(capability: Capability | undefined): string {
  if (!capability) return "";
  const schema = capability.input_schema ?? {};
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const fields = Object.entries(properties).map(([name, p]) => {
    const facts = [required.includes(name) ? "required" : "optional", String(p.type ?? "")];
    if (p.pattern) facts.push(String(p.pattern));
    if (Array.isArray(p.enum)) facts.push(p.enum.join("|"));
    if (p.minimum !== undefined || p.maximum !== undefined) facts.push(`${String(p.minimum ?? "")}..${String(p.maximum ?? "")}`);
    return `${name} (${facts.filter(Boolean).join(", ")})`;
  });
  return fields.length ? fields.join(" · ") : "no arguments";
}

function parseObject(raw: string, what: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(raw), error: null };
  } catch (error) {
    return { value: null, error: `${what} isn't JSON (${error instanceof Error ? error.message : "parse error"}). A body that isn't JSON is a make tools-check row.` };
  }
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

const PRESETS: { label: string; mode: Mode; capability: string; args: Record<string, unknown>; subject: string }[] = [
  { label: "Where are my recent orders?", mode: "tool", capability: "orders.list_recent", args: { limit: 5 }, subject: CUSTOMER },
  { label: "What's in order 48213?", mode: "tool", capability: "orders.get", args: { order_id: "48213" }, subject: CUSTOMER },
  { label: "Someone else's order (70011)", mode: "tool", capability: "orders.get", args: { order_id: "70011" }, subject: CUSTOMER },
  { label: "Cancel order 55120", mode: "propose", capability: "orders.cancel", args: { order_id: "55120", reason: "changed_mind" }, subject: CUSTOMER },
  { label: "Cancel a shipped order (48213)", mode: "propose", capability: "orders.cancel", args: { order_id: "48213" }, subject: CUSTOMER },
];

/** The air-tools-gateway tab. The console plays air-orchestrator-service:
 * the BFF holds the target's read and execute keys and attaches the right
 * one for the route; the body carries the subject the orchestrator would
 * have verified from a customer token. A propose changes nothing; only
 * execute does, and only with the execute key. */
export function ToolsTab({ connection }: { connection: Connection }) {
  const [mode, setMode] = useState<Mode>("tool");
  const [toolName, setToolName] = useState("orders.list_recent");
  const [actionName, setActionName] = useState("orders.cancel");
  const [argsText, setArgsText] = useState<Record<"tool" | "propose", string>>({
    tool: pretty({ limit: 5 }),
    propose: pretty({ order_id: "55120", reason: "changed_mind" }),
  });
  const [subject, setSubject] = useState(CUSTOMER);
  const [subjectNull, setSubjectNull] = useState(false);
  const [locale, setLocale] = useState({ enabled: false, value: "en-IN" });
  const [proposalId, setProposalId] = useState("");
  const [idemEnabled, setIdemEnabled] = useState(true);
  const [idemKey, setIdemKey] = useState(() => freshIdempotencyKey());
  const [rawEnabled, setRawEnabled] = useState(false);
  const [raw, setRaw] = useState("");
  const [confirming, setConfirming] = useState(false);

  const slots = { tool: useSendRequest(connection), propose: useSendRequest(connection), execute: useSendRequest(connection) };
  const mutation = slots[mode];
  const configured = Boolean(connection.baseUrl.trim());
  const remote = isRemote(connection);

  const readyQuery = useQuery({
    queryKey: ["tools-ready", connection.target, connection.baseUrl],
    enabled: configured,
    queryFn: () => sendViaProxy(connection, "/v1/ready"),
  });
  const capabilitiesQuery = useQuery({
    queryKey: ["tools-capabilities", connection.target, connection.baseUrl],
    enabled: configured,
    queryFn: () => sendViaProxy(connection, "/v1/capabilities"),
  });
  const inventory = (capabilitiesQuery.data?.statusCode === 200 ? capabilitiesQuery.data.responseJson : null) as Inventory | null;

  const kind = mode === "tool" ? "read" : "write";
  const offered = capabilitiesFor(inventory, kind);
  const name = mode === "tool" ? toolName : actionName;
  const capability = offered.find((c) => c.name === name);
  const path = mode === "tool" ? toolPath(name) : mode === "propose" ? proposePath(name) : executePath(name);

  const pickCapability = (next: string) => {
    if (mode === "tool") setToolName(next);
    else setActionName(next);
    if (mode !== "execute") {
      const picked = offered.find((c) => c.name === next);
      setArgsText((prev) => ({ ...prev, [mode]: pretty(sampleArguments(picked)) }));
    }
  };

  const errors: string[] = [];
  let body: unknown;
  const subjectValue = subjectNull ? null : subject;
  if (rawEnabled) {
    const parsed = parseObject(raw, "The raw body");
    body = parsed.value;
    if (parsed.error) errors.push(parsed.error);
  } else if (mode === "execute") {
    body = { proposal_id: proposalId, subject: subjectValue };
  } else {
    const parsed = parseObject(argsText[mode], "arguments");
    if (parsed.error) errors.push(parsed.error);
    body = { arguments: parsed.value, subject: subjectValue, ...(locale.enabled ? { locale: locale.value } : {}) };
  }
  if (!configured) errors.push("No air-tools-gateway base URL set on the server for this target.");
  if (mode === "execute" && !connection.executeKeyed) {
    errors.push("This target has no execute key configured, so the console refuses execute. Set AIR_WEB__TARGETS__<NAME>__TOOLS_EXECUTE_API_KEY to opt in.");
  }
  if (mode === "execute" && !rawEnabled && !proposalId.trim()) errors.push("No proposal_id: propose first, then Confirm.");

  const sendNow = () =>
    mutation.mutate({
      path,
      method: "POST",
      body,
      ...(mode === "execute" && idemEnabled ? { idempotencyKey: idemKey } : {}),
    });

  const onSend = () => {
    if (mode === "execute" && remote) setConfirming(true);
    else sendNow();
  };

  /** Turn 2: the customer pressed Confirm. */
  const confirmProposal = (exchange: Exchange) => {
    const proposal = (exchange.responseJson ?? {}) as Record<string, unknown>;
    setProposalId(String(proposal.proposal_id ?? ""));
    setActionName(String(proposal.capability ?? actionName));
    setIdemKey(freshIdempotencyKey());
    setIdemEnabled(true);
    setRawEnabled(false);
    setMode("execute");
  };

  const proposed = slots.propose.data;
  const canConfirm = proposed?.statusCode === 200 && Boolean((proposed.responseJson as Record<string, unknown> | null)?.proposal_id);

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        The AIR platform&apos;s one gateway to business systems: declared lookups, and changes behind propose then
        execute. Here the console plays air-orchestrator-service. The server holds the target&apos;s <b>read</b> and{" "}
        <b>execute</b> keys and picks one from the route, so the browser never chooses a credential; the tenant comes from
        the key, and the body carries the <code>subject</code> the orchestrator would have verified.
      </Typography>
      <TargetCaption connection={connection} />
      <ToolsStatus
        connection={connection}
        ready={readyQuery.data}
        capabilities={capabilitiesQuery.data}
        onReload={() => {
          void readyQuery.refetch();
          void capabilitiesQuery.refetch();
        }}
      />

      <RouteCard
        path={mode === "tool" ? "POST /v1/tools/{name}" : mode === "propose" ? "POST /v1/actions/{name}/propose" : "POST /v1/actions/{name}/execute"}
        description={
          mode === "tool" ? (
            <>Run a <code>read</code> capability for one customer. Another customer&apos;s order is the same 404 as a missing one.</>
          ) : mode === "propose" ? (
            <>Check and price a <code>write</code> capability, and store a proposal for up to 10 minutes. <b>Nothing changes.</b></>
          ) : (
            <>Re-check and perform a proposal, once. The same <code>Idempotency-Key</code> always returns the first answer.</>
          )
        }
        detail={
          mode === "execute" ? (
            <>
              key: execute · header: Idempotency-Key (16–128 of [A-Za-z0-9_.:-], required) · body: proposal_id, subject
              <br />
              returns: status done | pending_approval | rejected, execution_id, result · 409 already_executed | proposal_expired
            </>
          ) : (
            <>
              key: read · body: arguments (the capability&apos;s input_schema), subject, locale? · no tenant, ever
              <br />
              errors: problem+json with a closed-set <code>code</code> · {mode === "propose" ? "422 invalid_state when the change isn't possible now" : "404 unknown_capability for a write"}
            </>
          )
        }
      />

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
        {PRESETS.map((preset) => (
          <Chip
            key={preset.label}
            label={preset.label}
            size="small"
            variant="outlined"
            onClick={() => {
              setMode(preset.mode);
              if (preset.mode === "tool") setToolName(preset.capability);
              else setActionName(preset.capability);
              setArgsText((prev) => ({ ...prev, [preset.mode]: pretty(preset.args) }));
              setSubject(preset.subject);
              setSubjectNull(false);
              setRawEnabled(false);
            }}
          />
        ))}
      </Box>

      <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)} sx={{ mb: 1 }}>
        {MODES.map((m) => (
          <FormControlLabel key={m.key} value={m.key} control={<Radio size="small" />} label={m.label} />
        ))}
      </RadioGroup>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-start", mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel id="tools-capability-label">capability</InputLabel>
          <Select labelId="tools-capability-label" label="capability" value={offered.some((c) => c.name === name) ? name : ""} onChange={(e) => pickCapability(String(e.target.value))}>
            {offered.map((c) => (
              <MenuItem key={c.name} value={c.name}>
                {c.name}
                {c.risk ? ` · ${c.risk} risk` : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="subject"
          value={subjectNull ? "" : subject}
          disabled={subjectNull}
          onChange={(e) => setSubject(e.target.value)}
          helperText={
            <>
              the customer, as the orchestrator verified them ·{" "}
              {[CUSTOMER, OTHER_CUSTOMER].map((s) => (
                <Button key={s} size="small" sx={{ minWidth: 0, p: 0, mr: 0.5, textTransform: "none" }} onClick={() => { setSubject(s); setSubjectNull(false); }}>
                  {s}
                </Button>
              ))}
            </>
          }
        />
        <FormControlLabel control={<Checkbox size="small" checked={subjectNull} onChange={(e) => setSubjectNull(e.target.checked)} />} label="send subject: null" />
      </Box>

      {mode !== "execute" ? (
        <Box sx={{ mb: 1 }}>
          <TextField
            label="arguments"
            multiline
            minRows={3}
            fullWidth
            value={argsText[mode]}
            onChange={(e) => setArgsText((prev) => ({ ...prev, [mode]: e.target.value }))}
            slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: "0.85rem" } } }}
            helperText={<>schema: {schemaLine(capability)} · sent exactly as written, so a wrong field or type is a real test</>}
          />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
            <Checkbox size="small" checked={locale.enabled} onChange={(e) => setLocale((l) => ({ ...l, enabled: e.target.checked }))} />
            <TextField size="small" label="locale · optional" value={locale.value} disabled={!locale.enabled} onChange={(e) => setLocale((l) => ({ ...l, value: e.target.value }))} />
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-start", mb: 1 }}>
          <TextField size="small" label="proposal_id" value={proposalId} onChange={(e) => setProposalId(e.target.value)} sx={{ minWidth: 220 }} helperText="filled in by Confirm, after a propose" />
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Checkbox size="small" checked={idemEnabled} onChange={(e) => setIdemEnabled(e.target.checked)} />
            <TextField
              size="small"
              label="Idempotency-Key"
              value={idemKey}
              disabled={!idemEnabled}
              onChange={(e) => setIdemKey(e.target.value)}
              sx={{ minWidth: 320 }}
              error={idemEnabled && !IDEMPOTENCY_KEY.test(idemKey)}
              helperText={
                idemEnabled
                  ? IDEMPOTENCY_KEY.test(idemKey)
                    ? "same key again = replay of the first answer"
                    : "not 16–128 of [A-Za-z0-9_.:-]: the gateway should answer 400"
                  : "unticked: no header at all, which should be a 400"
              }
            />
            <Button size="small" onClick={() => setIdemKey(freshIdempotencyKey())} disabled={!idemEnabled}>
              New key
            </Button>
          </Box>
        </Box>
      )}

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={rawEnabled}
            onChange={(e) => {
              if (e.target.checked && body !== undefined && body !== null) setRaw(pretty(body));
              setRawEnabled(e.target.checked);
            }}
          />
        }
        label="Edit the raw body (for envelope cases: a tenant field, a missing subject)"
      />
      {rawEnabled && (
        <TextField
          label="body"
          multiline
          minRows={5}
          fullWidth
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: "0.85rem" } } }}
          sx={{ mb: 1 }}
        />
      )}

      <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mt: 1 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Request body preview</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <JsonViewer value={body ?? null} />
        </AccordionDetails>
      </Accordion>

      {mode === "execute" && remote && connection.executeKeyed && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          This target is <b>remote</b>: execute changes that environment&apos;s real data. The console asks before each one.
        </Alert>
      )}

      <SendRow
        label={mode === "execute" ? "Execute" : "Send"}
        url={joinUrl(connection.baseUrl || "https://—", path)}
        connection={connection}
        errors={errors}
        loading={mutation.isPending}
        onSend={onSend}
        extra={
          mode === "propose" && canConfirm ? (
            <Button variant="outlined" onClick={() => confirmProposal(proposed!)} data-testid="confirm-proposal">
              Confirm (execute this proposal)
            </Button>
          ) : undefined
        }
      />

      {mutation.data ? (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>
            Response
          </Typography>
          <ResponseView exchange={mutation.data as Exchange} storageKey={`tools-${mode}`} summary={(_payload, exchange) => <ToolsSummary exchange={exchange} />} />
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 2, fontStyle: "italic" }}>
          No {mode} call sent yet this session.
        </Typography>
      )}

      <Divider sx={{ my: 3 }} />
      <SimulationPanel connection={connection} />

      <ConfirmWrite
        connection={connection}
        what={`Execute proposal ${proposalId || "(none)"} (${actionName})`}
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          sendNow();
        }}
      />
    </Box>
  );
}
