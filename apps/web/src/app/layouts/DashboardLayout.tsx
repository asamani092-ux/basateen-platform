import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { LogOut, Menu, Moon, Sun, Tv, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { navItems } from "../config/routes";
import { useAuth } from "../context/AuthContext";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function DashboardLayout() {
  const [isDark, setIsDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function launchTv() {
    window.open("/tv-live", "_blank", "noopener,noreferrer");
  }

  const nav = (
    <>
      {navItems.map((item) => {
        const active = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={`block px-4 py-2.5 rounded-xl text-sm transition-colors ${active ? "bg-[#1e3a8a] text-white" : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1e3a5f]"}`}
            style={tajawal}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className={isDark ? "dark" : ""}>
      <div
        className="min-h-screen bg-slate-50 dark:bg-[#0a1628] transition-colors flex"
        dir="rtl"
      >
        <aside className="w-64 shrink-0 bg-white dark:bg-[#132337] border-l border-slate-200 dark:border-[#1e3a5f] hidden lg:flex flex-col">
          <div className="p-6 border-b border-slate-200 dark:border-[#1e3a5f] flex items-center gap-3">
            <img
              src={isDark ? "/logo-dark.png" : "/logo-light.png"}
              alt="مجمع حلقات البساتين"
              className="h-12 w-auto object-contain shrink-0"
            />
            <div>
              <p
                className="font-bold text-sm text-slate-900 dark:text-white"
                style={tajawal}
              >
                مجمع البساتين
              </p>
              <p
                className="text-xs text-slate-500 dark:text-slate-400"
                style={tajawal}
              >
                {user?.full_name_ar}
              </p>
            </div>
          </div>
          <nav className="p-4 flex-1 overflow-y-auto space-y-1">{nav}</nav>
          <div className="p-4 border-t border-slate-200 dark:border-[#1e3a5f]">
            <Button
              type="button"
              onClick={launchTv}
              className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl gap-2"
              style={tajawal}
            >
              <Tv className="w-4 h-4" />
              تشغيل شاشة التلفاز
            </Button>
          </div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="إغلاق القائمة"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white dark:bg-[#132337] border-l border-slate-200 dark:border-[#1e3a5f] flex flex-col shadow-xl">
              <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-[#1e3a5f]">
                <span
                  className="font-bold text-slate-900 dark:text-white"
                  style={tajawal}
                >
                  القائمة
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  type="button"
                >
                  <X className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                </Button>
              </div>
              <nav className="p-4 flex-1 overflow-y-auto space-y-1">{nav}</nav>
              <div className="p-4">
                <Button
                  type="button"
                  onClick={() => {
                    launchTv();
                    setMobileOpen(false);
                  }}
                  className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl gap-2"
                  style={tajawal}
                >
                  <Tv className="w-4 h-4" />
                  شاشة التلفاز
                </Button>
              </div>
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white dark:bg-[#132337] border-b border-slate-200 dark:border-[#1e3a5f] sticky top-0 z-50">
            <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl lg:hidden shrink-0"
                  onClick={() => setMobileOpen(true)}
                  type="button"
                  title="القائمة"
                >
                  <Menu className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                </Button>
                <h1
                  className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
                  style={tajawal}
                >
                  مجمع حلقات البساتين
                </h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl hidden sm:inline-flex gap-1 text-slate-700 dark:text-slate-200 border-[#1e3a8a] dark:border-[#3b82f6]"
                  onClick={launchTv}
                  type="button"
                  style={tajawal}
                >
                  <Tv className="w-4 h-4" />
                  شاشة التلفاز
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => setIsDark(!isDark)}
                  type="button"
                  title="الوضع الليلي"
                >
                  {isDark ? (
                    <Sun className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                  ) : (
                    <Moon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl hidden sm:inline-flex text-slate-700 dark:text-slate-200"
                  onClick={handleLogout}
                  type="button"
                  style={tajawal}
                >
                  خروج
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  onClick={handleLogout}
                  type="button"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                </Button>
              </div>
            </div>
          </header>
          <main className="flex-1 min-h-[50vh] p-4 sm:p-6 md:p-8 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
