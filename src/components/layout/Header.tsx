import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export function Header() {
  return (
    <Box sx={{ pb: 1.5, mb: 1.5, borderBottom: 1, borderColor: "divider" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
        {/* The logo's own lockup already reads "AIR" / "AI-READY PLATFORM";
            the heading adds only the product name, rather than repeating it. */}
        <Box sx={{ height: 44, flexShrink: 0, lineHeight: 0, borderRadius: 1.5, overflow: "hidden" }}>
          <Box component="img" src="/logo.svg" alt="AIR" sx={{ height: 44, width: "auto", display: "block" }} />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: "-0.2px" }}>
          AIR Web Console
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        A developer&apos;s bench for the AIR services — send a request, read the response. Runs on
        your machine against whichever environment you select.
      </Typography>
    </Box>
  );
}
