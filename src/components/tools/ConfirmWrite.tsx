"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

import type { Connection } from "@/lib/connection";

/** Asked before anything that executes on a REMOTE target: there, execute
 * reaches that environment's real business system, not a fixture. A local
 * target never asks. */
export function ConfirmWrite({
  connection,
  what,
  open,
  onCancel,
  onConfirm,
}: {
  connection: Connection;
  /** What is about to happen, in a few words. */
  what: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} data-testid="confirm-write">
      <DialogTitle>Execute on {connection.targetLabel}?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {what} on <b>{connection.baseUrl}</b>, a <b>remote</b> target, with its execute key. This can change real data
          in that environment&apos;s business system, and it can&apos;t be undone from here.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} autoFocus>
          Cancel
        </Button>
        <Button color="warning" variant="contained" onClick={onConfirm}>
          Execute
        </Button>
      </DialogActions>
    </Dialog>
  );
}
