import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectCurrentToken } from "../auth/authSlice";
import { apiSlice } from "../../api/apiSlice";
import type { RealtimeMissionEvent } from "../../api/types";

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "http://localhost:3000";

/**
 * REQ-6.12: subscribes to one mission's real-time channel
 * (`apps/api`'s `MissionEventsGateway`, REQ-6.5) for as long as a
 * component using this hook is mounted — a mission detail view opens
 * one connection while visible, closes it on navigating away. Rather
 * than hand-patch the RTK Query cache from the relayed event's payload
 * (which would duplicate `apps/api`'s own response-shaping logic on the
 * client), a relayed event just invalidates the mission's tags so
 * `useGetMissionQuery`/`useListDetectionsQuery`/`useListAuditLogQuery`
 * refetch — simpler and can't drift from what a REST read would show,
 * at the cost of one extra round trip per event. Revisit only if that
 * round trip is shown to matter under real load (same "start simple"
 * posture the backend phases used throughout).
 */
export function useMissionSocket(missionId: string | undefined) {
  const dispatch = useAppDispatch();
  const token = useAppSelector(selectCurrentToken);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!missionId || !token) {
      return;
    }

    const socket = io(`${WS_BASE_URL}/missions`, {
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("subscribeMission", { missionId });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("missionEvent", (_event: RealtimeMissionEvent) => {
      dispatch(
        apiSlice.util.invalidateTags([
          { type: "Mission", id: missionId },
          { type: "Detections", id: missionId },
          { type: "AuditLog", id: missionId },
        ]),
      );
    });

    return () => {
      socket.emit("unsubscribeMission", { missionId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [missionId, token, dispatch]);

  return { connected };
}
