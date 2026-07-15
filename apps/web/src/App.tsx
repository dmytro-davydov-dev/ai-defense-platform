import { Provider } from "react-redux";
import { RouterProvider } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { store } from "./app/store";
import { theme } from "./app/theme";
import { router } from "./app/router";

/**
 * REQ-6.6: the real Mission Workspace root, replacing Phase 1's
 * placeholder page (docs/frontend/Web_Shell.md). Provider order:
 * Redux store, then MUI theme, then the router — every route renders
 * inside both.
 */
function App() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>
  );
}

export default App;
