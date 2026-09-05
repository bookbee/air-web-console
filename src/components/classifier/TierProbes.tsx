"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { TIER_PROBES, TIERS, type TierProbe } from "./data";

/** Force the ladder onto one named rung, reproducing air-classifier-service's own
 * README cases — ported from `_tier_probes`. Each button sets the text
 * (and, for one case, `rating`) plus `options.min_tier`/`max_tier` pinned
 * to the tier named, so the verdict cannot have come from anywhere else. */
export function TierProbes({ onApply }: { onApply: (probe: TierProbe) => void }) {
  return (
    <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mb: 2 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2">Tier probes — pin the ladder to one rung, from the README</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Each button sets the text (and pins <code>options.min_tier</code>/<code>max_tier</code> to
          the tier named) so the verdict cannot have come from anywhere else — a pinned tier that
          cannot serve returns <code>503</code> rather than quietly falling back.
        </Typography>
        <Grid container spacing={2}>
          {TIERS.map((tier) => (
            <Grid key={tier} size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="caption" sx={{ fontFamily: "monospace", display: "block", mb: 0.5 }}>
                {tier}
              </Typography>
              <Stack spacing={0.75}>
                {TIER_PROBES.filter((probe) => probe.tier === tier).map((probe) => (
                  <Tooltip key={probe.label} title={probe.why}>
                    <Button size="small" variant="outlined" fullWidth onClick={() => onApply(probe)}>
                      {probe.label}
                    </Button>
                  </Tooltip>
                ))}
              </Stack>
            </Grid>
          ))}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}
