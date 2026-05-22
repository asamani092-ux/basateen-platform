import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";

/** توجيه المسار الجذر أو غير المعروف إلى لوحة المستخدم الصحيحة */
export function AuthHomeRedirect() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated || !user) {
    logout();
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={user.homePath} replace />;
}
