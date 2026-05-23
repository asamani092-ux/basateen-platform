import { Outlet } from "react-router";
import { ProgScopeBanner } from "../components/prog/ProgScopeBanner";
import { useAuth } from "../context/AuthContext";
import { ds, tajawal } from "../lib/design-system";

export function ProgSupervisorLayout() {
  const { user } = useAuth();

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          إدارة البرامج والأنشطة
        </h2>
        <p className={ds.page.description} style={tajawal}>
          {user?.full_name_ar} — اختبارات معرفية، تحليلات، وأرشيف — معزول عن مسار الحفظ
          اليومي
        </p>
      </div>
      <ProgScopeBanner />
      <Outlet />
    </div>
  );
}
