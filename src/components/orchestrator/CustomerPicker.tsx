"use client";

import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { CUSTOMER_TOKEN_MODES, MODE_LABELS, type CustomerTokenMode } from "@/lib/customerTokenModes";
import { useConnectionStore } from "@/store/connectionStore";

const ANONYMOUS = "";

/** Who a customer-channel request is made "as": an anonymous customer, or
 * one of the target's configured customers, for whom the BFF mints a
 * development customer token. The picker only names a customer; the server
 * decides whether to mint. Remembered per target. Plus, where the target
 * allows them, the SIT token modes that check the orchestrator refuses a
 * bad token. */
export function CustomerPicker({
  mode,
  onModeChange,
  onCustomerChange,
}: {
  mode: CustomerTokenMode;
  onModeChange: (mode: CustomerTokenMode) => void;
  /** Called after the pick changes: a session belongs to the customer who
   * started it (spec 0014, REQ-CTK-007), so the tab starts a new one. */
  onCustomerChange?: () => void;
}) {
  const selectedTarget = useConnectionStore((state) => state.selectedTarget);
  const target = useConnectionStore((state) => state.targets[state.selectedTarget]);
  const picked = useConnectionStore((state) => state.customerByTarget[state.selectedTarget] ?? ANONYMOUS);
  const setCustomer = useConnectionStore((state) => state.setCustomer);

  const configured = Boolean(target?.orchestratorCustomerTokenConfigured);
  const subjects = configured ? (target?.orchestratorCustomerSubjects ?? []) : [];
  const value = subjects.includes(picked) ? picked : ANONYMOUS;
  const reason = target?.orchestratorCustomerTokenError ?? "This target has no customer token configured";

  const select = (
    <FormControl size="small" sx={{ minWidth: 220 }} disabled={!configured}>
      <InputLabel id="customer-select-label">Customer</InputLabel>
      <Select
        labelId="customer-select-label"
        label="Customer"
        value={value}
        onChange={(event) => {
          setCustomer(selectedTarget, String(event.target.value));
          onCustomerChange?.();
        }}
        inputProps={{ "data-testid": "customer-select" }}
      >
        <MenuItem value={ANONYMOUS}>Anonymous</MenuItem>
        {subjects.map((subject) => (
          <MenuItem key={subject} value={subject}>
            {subject}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 1.5 }}>
      {configured ? (
        select
      ) : (
        <Tooltip title={reason}>
          <span>{select}</span>
        </Tooltip>
      )}
      {configured && value && target?.orchestratorCustomerTokenTestModes && (
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="token-mode-label">Token</InputLabel>
          <Select
            labelId="token-mode-label"
            label="Token"
            value={mode}
            onChange={(event) => onModeChange(event.target.value as CustomerTokenMode)}
            inputProps={{ "data-testid": "token-mode-select" }}
          >
            {CUSTOMER_TOKEN_MODES.map((m) => (
              <MenuItem key={m} value={m}>
                {MODE_LABELS[m]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 520 }}>
        {value
          ? <>The console mints a short-lived customer token for <b>{value}</b> on its server and sends it as <code>air-token</code>; the browser never holds it.</>
          : "No customer token: the orchestrator serves an anonymous customer."}
        {value && mode !== "valid" ? <> Test mode <b>{MODE_LABELS[mode]}</b>: the orchestrator should refuse it with 401.</> : null}
      </Typography>
    </Box>
  );
}
