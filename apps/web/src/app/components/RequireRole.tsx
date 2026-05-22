import { Navigate, Outlet } from "react-router";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../lib/auth-store";

export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to={user.homePath} replace />;
  }

  return <Outlet />;
}
