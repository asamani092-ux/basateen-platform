import { Outlet } from "react-router";
import { useAuth } from "../context/AuthContext";
import { ds, tajawal } from "../lib/design-system";

/** غلاف القسم التعليمي — القائمة في RoleShellLayout */
export function EduSupervisorLayout() {
  const { user } = useAuth();

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          القسم التعليمي
        </h2>
        <p className={ds.page.description} style={tajawal}>
          {user?.full_name_ar} — القبول والتوزيع، محرك الفعاليات، ومتابعة الطلاب
        </p>
      </div>
      <Outlet />
    </div>
  );
}
