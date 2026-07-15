import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { useListAuditLogQuery } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";

/** REQ-6.3/6.16: every audit row recorded against this mission, including the system-triggered (`null`-actor) transitions Phase 3 introduced (Security_Baseline.md). */
export function AuditTrailView({ missionId }: { missionId: string }) {
  const { data: entries, isLoading, error } = useListAuditLogQuery(missionId);

  if (isLoading) {
    return <CircularProgress size={20} />;
  }
  if (error) {
    return <Alert severity="error">{extractErrorMessage(error)}</Alert>;
  }
  if (!entries || entries.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No audit entries yet.
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>When</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Actor</TableCell>
            <TableCell>Details</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
              <TableCell>{entry.action}</TableCell>
              <TableCell>{entry.actorUserId ?? "system"}</TableCell>
              <TableCell>{formatMetadata(entry.metadata)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function formatMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }
  try {
    return JSON.stringify(metadata);
  } catch {
    return "";
  }
}
