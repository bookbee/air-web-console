"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { JsonViewer } from "@/components/shared/JsonViewer";
import { TableTitle } from "@/components/shared/DashboardGrid";

/**
 * The second half of `confirm` — executing or declining a proposed
 * mutation. Ported from `_proposal_panel`. A turn that proposes a mutation
 * changes nothing on its own; confirming or declining it is an ordinary
 * turn on the *same* session carrying a `confirm: {proposal_id, approve}`
 * object. Neither development key grants `allow_actions`, so both actions
 * 403 against a local checkout — the correct, honest outcome.
 */
export function ProposalPanel({
  proposal,
  sessionId,
  onAction,
  disabled,
}: {
  proposal: Record<string, unknown>;
  sessionId: string;
  onAction: (approve: boolean) => void;
  disabled?: boolean;
}) {
  const proposalId = proposal.proposal_id;

  return (
    <Box sx={{ mb: 2 }}>
      <TableTitle title="Proposal" />
      <Alert severity="info" sx={{ my: 1 }}>
        This turn proposes a mutation and changed nothing. Confirming or declining it sends a
        second turn on the same session carrying <code>confirm</code> — needs a key with{" "}
        <code>allow_actions</code>, which neither development key grants by default.
      </Alert>
      <JsonViewer value={proposal} />

      {typeof proposalId === "string" && proposalId && (
        <>
          {!sessionId && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              No session id captured for this turn yet — a confirmation has to land on the same
              session the proposal did.
            </Typography>
          )}
          {sessionId && (
            <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
              <Button variant="contained" disabled={disabled} onClick={() => onAction(true)}>
                Confirm &amp; execute
              </Button>
              <Button variant="outlined" disabled={disabled} onClick={() => onAction(false)}>
                Decline
              </Button>
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
