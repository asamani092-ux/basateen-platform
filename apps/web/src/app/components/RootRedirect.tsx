import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";

export function RootRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={user.homePath} replace />;
}
