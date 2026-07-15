import { createTheme } from "@mui/material/styles";

/**
 * REQ-6.6: a single, deliberately restrained theme — dark, low-chrome,
 * consistent with an operational/analytical tool rather than a
 * consumer app. No design-system decisions beyond this are made
 * elsewhere; every component should read spacing/color from this theme,
 * not hardcode values.
 */
export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#4fc3f7" },
    secondary: { main: "#ff9800" },
    background: { default: "#0b1015", paper: "#131a20" },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: [
      "Inter",
      "-apple-system",
      "BlinkMacSystemFont",
      "Segoe UI",
      "Roboto",
      "sans-serif",
    ].join(","),
  },
});
