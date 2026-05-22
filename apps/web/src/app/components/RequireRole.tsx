import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../lib/auth-store";

export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!roles.includes(user.role)) {
    if (location.pathname === user.homePath) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to={user.homePath} replace />;
  }

  return <Outlet />;
}
