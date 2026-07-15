import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { ProtectedRoute } from "../features/auth/ProtectedRoute";
import { LoginPage } from "../features/auth/LoginPage";
import { MissionListPage } from "../features/missions/MissionListPage";
import { MissionDetailPage } from "../features/missions/MissionDetailPage";

/** REQ-6.6: route table — `/login` is public, everything else requires `ProtectedRoute`'s session check. */
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <Navigate to="/missions" replace /> },
          { path: "/missions", element: <MissionListPage /> },
          { path: "/missions/:missionId", element: <MissionDetailPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/missions" replace /> },
]);
