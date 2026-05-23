import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";
import {
  ROLE_HOME,
  pathAllowedForRole,
  resolveEduTabRedirect,
  resolveGsTabRedirect,
  resolveLegacyRedirect,
  resolveProgTabRedirect,
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

  const eduTab = resolveEduTabRedirect(
    location.pathname,
    new URLSearchParams(location.search).get("tab"),
  );
  if (eduTab) {
    const qs = new URLSearchParams(location.search);
    qs.delete("tab");
    const rest = qs.toString();
    return <Navigate to={`${eduTab}${rest ? `?${rest}` : ""}`} replace />;
  }

  const gsTab = resolveGsTabRedirect(
    location.pathname,
    new URLSearchParams(location.search).get("tab"),
  );
  if (gsTab) {
    return <Navigate to={gsTab} replace />;
  }

  const progTab = resolveProgTabRedirect(
    location.pathname,
    new URLSearchParams(location.search).get("tab"),
  );
  if (progTab) {
    return <Navigate to={progTab} replace />;
  }

  if (!pathAllowedForRole(user.role, location.pathname)) {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }

  return <Outlet />;
}
