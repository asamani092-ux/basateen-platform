import { Navigate } from "react-router";
import { normalizeStoredHomePath } from "../config/role-access";
import { useAuth } from "../context/AuthContext";

/** توجيه المسار الجذر أو غير المعروف إلى لوحة المستخدم الصحيحة */
export function AuthHomeRedirect() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const target = normalizeStoredHomePath(user.role, user.homePath);
  return <Navigate to={target} replace />;
}
