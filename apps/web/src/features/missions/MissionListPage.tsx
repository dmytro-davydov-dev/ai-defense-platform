import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import AddIcon from "@mui/icons-material/Add";
import { useListMissionsQuery } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";
import { MissionStatusBadge } from "./MissionStatusBadge";
import { CreateMissionDialog } from "./CreateMissionDialog";

/** REQ-6.9: mission list — the operator's landing page after login. */
export function MissionListPage() {
  const [showArchived, setShowArchived] = useState(false);
  // Default (`false`) matches apps/api's `GET /missions` default — a
  // working list doesn't fill up with missions an operator already
  // archived. Toggling refetches from a separate RTK Query cache entry
  // for that arg, not a client-side filter, so it always reflects the
  // server's current state.
  const { data: missions, isLoading, error } = useListMissionsQuery(showArchived);
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Typography variant="h5">Missions</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showArchived}
                onChange={(event) => {
                  setShowArchived(event.target.checked);
                }}
              />
            }
            label="Show archived"
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            New mission
          </Button>
        </Box>
      </Box>

      {isLoading ? <CircularProgress size={24} /> : null}
      {error ? <Alert severity="error">{extractErrorMessage(error)}</Alert> : null}

      {missions?.length === 0 ? (
        <Typography color="text.secondary">
          {showArchived
            ? "No missions yet — create one to get started."
            : 'No active missions — create one to get started, or turn on "Show archived" to see archived ones.'}
        </Typography>
      ) : null}

      {missions && missions.length > 0 ? (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {missions.map((mission) => (
                <TableRow
                  key={mission.id}
                  hover
                  onClick={() => {
                    void navigate(`/missions/${mission.id}`);
                  }}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>{mission.title}</TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <MissionStatusBadge status={mission.status} />
                      {mission.archivedAt ? (
                        <Chip size="small" variant="outlined" color="default" label="Archived" />
                      ) : null}
                    </Box>
                  </TableCell>
                  <TableCell>{new Date(mission.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      <CreateMissionDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
        }}
      />
    </Box>
  );
}
