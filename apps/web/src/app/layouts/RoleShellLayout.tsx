import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  isNavActive,
  isNavGroup,
  navForRole,
  navGroupIsActive,
  type NavEntry,
  type NavGroup,
  type NavItem,
} from "../config/routes";
import { useAuth } from "../context/AuthContext";
import { AdminDataSyncProvider } from "../context/AdminDataSyncContext";
import type { UserRole } from "../lib/auth-store";
import { DevPreviewBanner } from "../components/DevPreviewBanner";
import { TeacherNotificationsBanner } from "../components/edu/TeacherNotificationsBanner";
import { ThemeToggle } from "../components/ThemeToggle";
import { ds, tajawal } from "../lib/design-system";

function NavLinkItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isNavActive(item.path, pathname);
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={active ? ds.nav.active : ds.nav.idle}
      style={tajawal}
    >
      {item.label}
    </Link>
  );
}

function NavGroupBlock({
  group,
  pathname,
  onNavigate,
  userRole,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
  userRole: UserRole;
}) {
  const groupActive = navGroupIsActive(group, pathname);
  const [open, setOpen] = useState(groupActive);

  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive, pathname]);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
          groupActive
            ? "bg-muted text-foreground"
            : "text-foreground hover:bg-muted"
        }`}
        style={tajawal}
        aria-expanded={open}
      >
        <span>{group.label}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mr-2 pr-2 border-r-2 border-border space-y-1">
          {group.children
            .filter((child) => child.roles.includes(userRole))
            .map((child) => (
              <NavLinkItem
                key={child.path}
                item={child}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function renderNav(
  entries: NavEntry[],
  pathname: string,
  userRole: UserRole,
  onNavigate?: () => void,
) {
  return entries.map((entry) =>
    isNavGroup(entry) ? (
      <NavGroupBlock
        key={entry.id}
        group={entry}
        pathname={pathname}
        userRole={userRole}
        onNavigate={onNavigate}
      />
    ) : (
      <NavLinkItem
        key={entry.path}
        item={entry}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    ),
  );
}

function SidebarBrand({ userName }: { userName?: string }) {
  return (
    <div className="p-6 border-b border-border flex items-center gap-3">
      <img
        src="/logo-light.png"
        alt="مجمع حلقات البساتين"
        className="h-12 w-auto object-contain shrink-0 dark:hidden"
      />
      <img
        src="/logo-dark.png"
        alt="مجمع حلقات البساتين"
        className="h-12 w-auto object-contain shrink-0 hidden dark:block"
      />
      <div className="min-w-0">
        <p className="font-bold text-base text-foreground truncate" style={tajawal}>
          مجمع البساتين
        </p>
        <p className="text-[10px] text-muted-foreground" style={tajawal}>
          منصة بساتين
        </p>
        {userName && (
          <p className="text-xs text-muted-foreground truncate" style={tajawal}>
            {userName}
          </p>
        )}
      </div>
    </div>
  );
}

function SidebarFooter({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="p-4 border-t border-border space-y-3 shrink-0">
      <div className="flex items-center justify-center gap-2">
        <ThemeToggle />
        <Button
          variant="outline"
          size="icon"
          className={ds.btnRound}
          onClick={onLogout}
          type="button"
          title="تسجيل الخروج"
          aria-label="تسجيل الخروج"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

/** لوحة موحّدة لكل أدوار الموظفين والمعلم */
export function RoleShellLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const visibleNav = user ? navForRole(user.role) : [];

  const nav = renderNav(
    visibleNav,
    location.pathname,
    user?.role ?? "teacher",
    () => setMobileOpen(false),
  );

  return (
    <AdminDataSyncProvider>
    <div className="main-layout min-h-screen bg-background text-foreground" dir="rtl">
      <div className="min-h-screen flex">
        <aside className="w-64 shrink-0 bg-card border-l border-border hidden lg:flex flex-col print:hidden">
          <SidebarBrand userName={user?.full_name_ar} />
          <nav className="p-4 flex-1 overflow-y-auto space-y-1 min-h-0">{nav}</nav>
          <SidebarFooter onLogout={handleLogout} />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden print:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="إغلاق القائمة"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-card border-l border-border flex flex-col shadow-xl">
              <div className="p-4 flex justify-between items-center border-b border-border shrink-0">
                <span className="font-bold text-sm" style={tajawal}>
                  القائمة
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className={ds.btnRound}
                  onClick={() => setMobileOpen(false)}
                  type="button"
                  aria-label="إغلاق"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="px-4 py-3 border-b border-border shrink-0">
                <p className="text-xs text-muted-foreground" style={tajawal}>
                  {user?.full_name_ar}
                </p>
              </div>
              <nav className="p-4 flex-1 overflow-y-auto space-y-1 min-h-0">
                {nav}
              </nav>
              <SidebarFooter onLogout={handleLogout} />
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <div className="lg:hidden sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 py-3 print:hidden flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="icon"
              className={ds.btnRound}
              onClick={() => setMobileOpen(true)}
              type="button"
              aria-label="فتح القائمة"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <p className="font-bold text-sm truncate flex-1 text-center" style={tajawal}>
              مجمع البساتين
            </p>
            <div className="w-10" aria-hidden />
          </div>
          <main className="flex-1 min-h-0 p-4 sm:p-6 md:p-8 overflow-auto">
            <DevPreviewBanner />
            <TeacherNotificationsBanner />
            <Outlet />
          </main>
        </div>
      </div>
    </div>
    </AdminDataSyncProvider>
  );
}
