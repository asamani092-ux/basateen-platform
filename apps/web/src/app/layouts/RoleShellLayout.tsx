import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { LogOut, Menu, Tv, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { isNavActive, navForRole } from "../config/routes";
import { useAuth } from "../context/AuthContext";
import { DevPreviewBanner } from "../components/DevPreviewBanner";
import { ds, tajawal } from "../lib/design-system";

/** لوحة موحّدة لكل أدوار الموظفين (غير المعلم) */
export function RoleShellLayout() {
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

  const visibleNav = user ? navForRole(user.role) : [];

  const nav = (
    <>
      {visibleNav.map((item) => {
        const active = isNavActive(item.path, location.pathname);
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={active ? ds.nav.active : ds.nav.idle}
            style={tajawal}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="min-h-screen flex">
        <aside className="w-64 shrink-0 bg-card border-l border-border hidden lg:flex flex-col">
          <div className="p-6 border-b border-border flex items-center gap-3">
            <img
              src="/logo-light.png"
              alt="مجمع حلقات البساتين"
              className="h-12 w-auto object-contain shrink-0"
            />
            <div>
              <p className="font-bold text-sm text-foreground" style={tajawal}>
                منصة بساتين
              </p>
              <p className="text-[10px] text-muted-foreground" style={tajawal}>
                مجمع حلقات البساتين
              </p>
              <p className="text-xs text-muted-foreground" style={tajawal}>
                {user?.full_name_ar}
              </p>
            </div>
          </div>
          <nav className="p-4 flex-1 overflow-y-auto space-y-1">{nav}</nav>
          <div className="p-4 border-t border-border">
            <Button
              type="button"
              onClick={launchTv}
              className={`w-full ${ds.btnRound}`}
              style={tajawal}
            >
              <Tv className="w-4 h-4" />
              شاشة التلفاز
            </Button>
          </div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="إغلاق"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-card border-l border-border flex flex-col shadow-xl">
              <div className="p-4 flex justify-between items-center border-b border-border">
                <span className="font-bold" style={tajawal}>
                  القائمة
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  type="button"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <nav className="p-4 flex-1 overflow-y-auto space-y-1">{nav}</nav>
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-card border-b border-border sticky top-0 z-50">
            <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className={`lg:hidden ${ds.btnRound}`}
                  onClick={() => setMobileOpen(true)}
                  type="button"
                >
                  <Menu className="w-5 h-5" />
                </Button>
                <h1 className="text-base sm:text-lg font-bold" style={tajawal}>
                  منصة بساتين
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={`hidden sm:inline-flex ${ds.btnRound}`}
                  onClick={launchTv}
                  type="button"
                  style={tajawal}
                >
                  <Tv className="w-4 h-4" />
                  التلفاز
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className={ds.btnRound}
                  onClick={handleLogout}
                  type="button"
                  title="خروج"
                >
                  <LogOut className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </header>
          <main className="flex-1 min-h-[50vh] p-4 sm:p-6 md:p-8 overflow-auto">
            <DevPreviewBanner />
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
