import { useCallback } from "react";
import { Link as RouterLink, Outlet, useNavigate } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import { useAppDispatch, useAppSelector } from "./hooks";
import { loggedOut, selectCurrentUser } from "../features/auth/authSlice";

/**
 * REQ-6.6: the shell every authenticated route renders inside — a top
 * bar (product name, signed-in user, logout, REQ-6.8) plus the routed
 * page body. `MissionListPage`/`MissionDetailPage`/etc. render via
 * `<Outlet />`, never duplicate this chrome themselves.
 */
export function AppLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectCurrentUser);

  const handleLogout = useCallback(() => {
    dispatch(loggedOut());
    navigate("/login", { replace: true });
  }, [dispatch, navigate]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/missions"
            sx={{ textDecoration: "none", color: "inherit", flexGrow: 1 }}
          >
            AI Defense Platform — Mission Workspace
          </Typography>
          {user ? (
            <>
              <Typography variant="body2" color="text.secondary">
                {user.displayName} ({user.roles.join(", ")})
              </Typography>
              <Button size="small" onClick={handleLogout}>
                Log out
              </Button>
            </>
          ) : null}
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ flexGrow: 1, py: 3 }} maxWidth="lg">
        <Outlet />
      </Container>
    </Box>
  );
}
