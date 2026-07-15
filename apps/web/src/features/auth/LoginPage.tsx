import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { useAppDispatch } from "../../app/hooks";
import { useLoginMutation, useRegisterMutation } from "../../api/apiSlice";
import { credentialsSet } from "./authSlice";
import { extractErrorMessage } from "../../shared/errors";

interface LocationState {
  from?: { pathname: string };
}

/** REQ-6.7: login screen against the JWT endpoints; also offers account creation (register) since nothing else in the workspace can create a first user. */
export function LoginPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [login, loginState] = useLoginMutation();
  const [register, registerState] = useRegisterMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const isSubmitting = loginState.isLoading || registerState.isLoading;
  const error = loginState.error ?? registerState.error;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result =
      tab === "login"
        ? await login({ email, password })
        : await register({ email, password, displayName });

    if (result.data) {
      dispatch(credentialsSet({ token: result.data.accessToken, user: result.data.user }));
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? "/missions", { replace: true });
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Paper sx={{ p: 4, width: 360 }} elevation={3}>
        <Typography variant="h5" gutterBottom>
          AI Defense Platform
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Mission Workspace
        </Typography>

        <Tabs
          value={tab}
          onChange={(_event, value: "login" | "register") => setTab(value)}
          sx={{ mb: 2 }}
        >
          <Tab value="login" label="Log in" />
          <Tab value="register" label="Create account" />
        </Tabs>

        <Box component="form" onSubmit={(event) => void handleSubmit(event)}>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{extractErrorMessage(error)}</Alert> : null}

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
              fullWidth
            />

            {tab === "register" ? (
              <TextField
                label="Display name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                fullWidth
              />
            ) : null}

            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              fullWidth
              {...(tab === "register" ? { helperText: "At least 8 characters." } : {})}
            />

            <Button type="submit" variant="contained" disabled={isSubmitting} fullWidth>
              {tab === "login" ? "Log in" : "Create account"}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
