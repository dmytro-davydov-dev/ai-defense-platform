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
import AddIcon from "@mui/icons-material/Add";
import { useListMissionsQuery } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";
import { MissionStatusBadge } from "./MissionStatusBadge";
import { CreateMissionDialog } from "./CreateMissionDialog";

/** REQ-6.9: mission list — the operator's landing page after login. */
export function MissionListPage() {
  const { data: missions, isLoading, error } = useListMissionsQuery();
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
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          New mission
        </Button>
      </Box>

      {isLoading ? <CircularProgress size={24} /> : null}
      {error ? <Alert severity="error">{extractErrorMessage(error)}</Alert> : null}

      {missions && missions.length === 0 ? (
        <Typography color="text.secondary">No missions yet — create one to get started.</Typography>
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
                  onClick={() => navigate(`/missions/${mission.id}`)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>{mission.title}</TableCell>
                  <TableCell>
                    <MissionStatusBadge status={mission.status} />
                  </TableCell>
                  <TableCell>{new Date(mission.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      <CreateMissionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </Box>
  );
}
