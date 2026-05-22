import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { LogOut, Moon, Sun } from "lucide-react";
import { Button } from "../components/ui/button";
import { navItems } from "../config/routes";
import { clearAuth } from "../lib/auth-store";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function DashboardLayout() {
  const [isDark, setIsDark] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  function logout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  return (
    <div className={isDark ? "dark" : ""}>
      <div
        className="min-h-screen bg-slate-50 dark:bg-[#0a1628] transition-colors flex"
        dir="rtl"
      >
        <aside className="w-64 shrink-0 bg-white dark:bg-[#132337] border-l border-slate-200 dark:border-[#1e3a5f] hidden md:flex flex-col">
          <div className="p-6 border-b border-slate-200 dark:border-[#1e3a5f] flex items-center gap-3">
            <img
              src={isDark ? "/logo-dark.png" : "/logo-light.png"}
              alt="مجمع حلقات البساتين"
              className="h-12 w-auto object-contain shrink-0"
            />
            <div>
              <p className="font-bold text-sm" style={tajawal}>
                مجمع البساتين
              </p>
              <p className="text-xs text-slate-500" style={tajawal}>
                منصة الإدارة
              </p>
            </div>
          </div>
          <nav className="p-4 flex-1 overflow-y-auto space-y-1">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`block px-4 py-2.5 rounded-xl text-sm transition-colors ${active ? "bg-[#1e3a8a] text-white" : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1e3a5f]"}`}
                  style={tajawal}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white dark:bg-[#132337] border-b border-slate-200 dark:border-[#1e3a5f] sticky top-0 z-50">
            <div className="px-6 py-4 flex items-center justify-between">
              <h1 className="text-lg font-bold" style={tajawal}>
                مجمع حلقات البساتين
              </h1>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => setIsDark(!isDark)}
                  type="button"
                  title="الوضع الليلي"
                >
                  {isDark ? (
                    <Sun className="w-5 h-5" />
                  ) : (
                    <Moon className="w-5 h-5" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  onClick={logout}
                  type="button"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </header>
          <main className="flex-1 p-6 md:p-8 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
