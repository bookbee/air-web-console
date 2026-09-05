"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

/** Every field `/v1/classify` accepts beyond text/context/metadata —
 * formerly split across `/feedback` and `/reviews`, both groups always
 * available now. Ported from `_optional_fields`. */
export function OptionalContext({ onChange }: { onChange: (extras: Record<string, unknown>) => void }) {
  const [channel, setChannel] = useState("");
  const [segment, setSegment] = useState("");
  const [subject, setSubject] = useState("");
  const [sendRating, setSendRating] = useState(false);
  const [rating, setRating] = useState(2);
  const [scale, setScale] = useState(5);
  const [product, setProduct] = useState("");
  const [title, setTitle] = useState("");
  const [verified, setVerified] = useState<"omit" | "true" | "false">("omit");

  useEffect(() => {
    const extras: Record<string, unknown> = {};
    if (channel.trim()) extras.channel = channel.trim();
    if (segment.trim()) extras.user_segment = segment.trim();
    if (subject.trim()) extras.subject = subject.trim();
    if (sendRating) {
      extras.rating = rating;
      extras.rating_scale_max = scale;
    }
    if (product.trim()) extras.product_id = product.trim();
    if (title.trim()) extras.title = title.trim();
    if (verified !== "omit") extras.verified_purchase = verified === "true";
    onChange(extras);
    // `onChange` excluded deliberately — see OptionsEditor.tsx's comment on
    // the same pattern. SingleForm passes a fresh inline callback here, so
    // including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, segment, subject, sendRating, rating, scale, product, title, verified]);

  return (
    <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mt: 1.5 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2">Optional context — feedback &amp; review fields, all independent</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="overline" color="text.secondary">
          Feedback-shaped
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="channel" size="small" fullWidth placeholder="app | email | support | survey" value={channel} onChange={(e) => setChannel(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="user_segment" size="small" fullWidth placeholder="enterprise" value={segment} onChange={(e) => setSegment(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="subject" size="small" fullWidth placeholder="Cannot check out" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Grid>
        </Grid>

        <Typography variant="overline" color="text.secondary">
          Review-shaped
        </Typography>
        <Grid container spacing={1.5} sx={{ alignItems: "center" }}>
          <Grid size={{ xs: 12, sm: 3 }}>
            <FormControlLabel
              control={<Checkbox checked={sendRating} onChange={(e) => setSendRating(e.target.checked)} />}
              label="send rating"
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              label="rating"
              type="number"
              size="small"
              fullWidth
              disabled={!sendRating}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              slotProps={{ htmlInput: { min: 0, step: 0.5 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              label="rating_scale_max"
              type="number"
              size="small"
              fullWidth
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              slotProps={{ htmlInput: { min: 0.1, max: 100, step: 1 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField label="product_id" size="small" fullWidth placeholder="SKU-1234" value={product} onChange={(e) => setProduct(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 6, sm: 6 }}>
            <TextField label="title" size="small" fullWidth placeholder="Late but works" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 6, sm: 6 }}>
            <TextField
              select
              label="verified_purchase"
              size="small"
              fullWidth
              value={verified}
              onChange={(e) => setVerified(e.target.value as typeof verified)}
            >
              <MenuItem value="omit">omit</MenuItem>
              <MenuItem value="true">true</MenuItem>
              <MenuItem value="false">false</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}
