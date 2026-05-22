import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { ClipboardList, Home, LogOut } from "lucide-react";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

const teacherNav = [
  { label: "الرئيسية", path: "/teacher", icon: Home },
  { label: "الرصد اليومي", path: "/teacher/daily-log", icon: ClipboardList },
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
    <div
      className="min-h-screen min-h-[100dvh] bg-slate-50 dark:bg-[#0a1628] flex flex-col"
      dir="rtl"
    >
      <header className="sticky top-0 z-50 bg-white dark:bg-[#132337] border-b border-slate-200 dark:border-[#1e3a5f] px-4 py-3 safe-area-top">
        <div className="flex items-center justify-between max-w-lg mx-auto w-full">
          <img
            src="/logo-light.png"
            alt=""
            className="h-10 w-auto dark:hidden"
          />
          <img
            src="/logo-dark.png"
            alt=""
            className="h-10 w-auto hidden dark:block"
          />
          <div className="text-center flex-1 px-2 min-w-0">
            <p
              className="text-sm font-bold text-slate-900 dark:text-white truncate"
              style={tajawal}
            >
              {user?.full_name_ar}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400" style={tajawal}>
              واجهة المعلم
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl shrink-0"
            onClick={handleLogout}
            type="button"
            title="خروج"
          >
            <LogOut className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24 max-w-lg mx-auto w-full overflow-auto">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white dark:bg-[#132337] border-t border-slate-200 dark:border-[#1e3a5f] px-2 py-2 safe-area-bottom md:max-w-lg md:mx-auto md:rounded-t-2xl">
        <div className="flex justify-around max-w-lg mx-auto">
          {teacherNav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs transition-colors ${active ? "text-[#1e3a8a] dark:text-[#3b82f6]" : "text-slate-600 dark:text-slate-300"}`}
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
