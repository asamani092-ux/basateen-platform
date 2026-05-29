import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";
import {
  ROLE_HOME,
  pathAllowedForRole,
  resolveLegacyRedirect,
} from "../config/role-access";

/** يمنع الوصول المباشر لمسار غير مسموح للدور */
export function RequirePathAccess() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const legacy = resolveLegacyRedirect(location.pathname, user.role);
  if (legacy) {
    return <Navigate to={legacy} replace />;
  }

  if (!pathAllowedForRole(user.role, location.pathname)) {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }

  return <Outlet />;
}
