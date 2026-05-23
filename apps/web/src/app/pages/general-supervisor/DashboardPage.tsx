import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { FeatureShell } from "../../components/_scaffold/FeatureShell";

export function GeneralSupervisorDashboardPage() {
  return (
    <FeatureShell
      title="لوحة المشرف العام"
      description="نظرة شاملة على القسم التعليمي وقسم البرامج — بدون إدارة الموظفين."
      badge="مشرف عام"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button asChild variant="default" className="rounded-xl">
          <Link to="/edu-supervisor/circles">الحلقات والنقل</Link>
        </Button>
        <Button asChild variant="default" className="rounded-xl">
          <Link to="/prog-supervisor/quizzes">الاختبارات</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/admin/students">الطلاب</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/programs">البرامج</Link>
        </Button>
      </div>
    </FeatureShell>
  );
}
