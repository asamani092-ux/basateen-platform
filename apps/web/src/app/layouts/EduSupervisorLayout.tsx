import { Outlet } from "react-router";
import { EduLegacyTabRedirect } from "../components/EduLegacyTabRedirect";
import { EduScopeBanner } from "../components/edu/EduScopeBanner";
import { useAuth } from "../context/AuthContext";
import { ds, tajawal } from "../lib/design-system";

/** غلاف صفحات المشرف التعليمي — القائمة في RoleShellLayout فقط */
export function EduSupervisorLayout() {
  const { user } = useAuth();

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          القسم التعليمي
        </h2>
        <p className={ds.page.description} style={tajawal}>
          {user?.full_name_ar} — متابعة الخطط، القبول والتوزيع، محرك الفعاليات
        </p>
      </div>
      <EduLegacyTabRedirect />
      <EduScopeBanner />
      <Outlet />
    </div>
  );
}
