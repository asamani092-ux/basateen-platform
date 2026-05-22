import { Navigate, Outlet, useLocation } from "react-router";
import { isLoggedIn } from "../lib/auth-store";

export function RequireAuth() {
  const location = useLocation();
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
