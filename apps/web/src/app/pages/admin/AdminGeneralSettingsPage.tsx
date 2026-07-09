import { SemesterSettingsCard } from "../../components/admin/SemesterSettingsCard";
import { ds, tajawal } from "../../lib/design-system";

export function AdminGeneralSettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          الإعدادات العامة
        </h2>
        <p className={ds.page.description} style={tajawal}>
          إدارة الفصل الدراسي وإعدادات المجمع — تصدير الأرشيف قبل الإغلاق.
        </p>
      </div>

      <SemesterSettingsCard />
    </div>
  );
}
