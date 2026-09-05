import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export function Header() {
  return (
    <Box sx={{ pb: 1.5, mb: 1.5, borderBottom: 1, borderColor: "divider" }}>
      <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: "-0.2px", mb: 0.3 }}>
        AIR Web Console
      </Typography>
      <Typography variant="body2" color="text.secondary">
        A developer&apos;s bench for the AIR services — send a request, read the response. Runs on
        your machine against whichever environment you select.
      </Typography>
    </Box>
  );
}
