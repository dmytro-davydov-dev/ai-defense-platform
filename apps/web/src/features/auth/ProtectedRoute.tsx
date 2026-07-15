import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppSelector } from "../../app/hooks";
import { selectIsAuthenticated } from "./authSlice";

/**
 * REQ-6.7: blocks every mission-workspace route until a valid session
 * exists, redirecting to `/login` and remembering where the operator was
 * headed so login can send them back (a plain `state.from`, not a query
 * param, so it never appears in browser history/bookmarks).
 */
export function ProtectedRoute() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
