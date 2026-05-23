import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { ClipboardList, LogOut } from "lucide-react";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { DevPreviewBanner } from "../components/DevPreviewBanner";
import { ds, tajawal } from "../lib/design-system";

const teacherNav = [
  { label: "واجهة المعلم", path: "/teacher", icon: ClipboardList },
];

export function TeacherLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col" dir="rtl">
      <header className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3 safe-area-top">
        <div className="flex items-center justify-between max-w-lg mx-auto w-full">
          <img src="/logo-light.png" alt="" className="h-10 w-auto dark:hidden" />
          <img
            src="/logo-dark.png"
            alt=""
            className="h-10 w-auto hidden dark:block"
          />
          <div className="text-center flex-1 px-2 min-w-0">
            <p
              className="text-sm font-bold text-foreground truncate"
              style={tajawal}
            >
              {user?.full_name_ar}
            </p>
            <p className="text-xs text-muted-foreground" style={tajawal}>
              واجهة المعلم — الرصد اليومي
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={`${ds.btnRound} shrink-0`}
            onClick={handleLogout}
            type="button"
            title="خروج"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24 max-w-lg mx-auto w-full overflow-auto">
        <DevPreviewBanner />
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-border px-2 py-2 safe-area-bottom md:max-w-lg md:mx-auto md:rounded-t-2xl">
        <div className="flex justify-around max-w-lg mx-auto">
          {teacherNav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
                style={tajawal}
              >
                <Icon className="w-6 h-6" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
