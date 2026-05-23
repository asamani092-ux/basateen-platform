import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { FeatureShell } from "../../components/_scaffold/FeatureShell";

export function CirclesPage() {
  return (
    <FeatureShell
      title="الحلقات والمسارات"
      description="إدارة الحلقات، المسارات، والموافقة على نقل الطلاب (منطق تراكمي)."
      badge="مشرف تعليمي"
    >
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="default" className="rounded-xl">
          <Link to="/admin/transfers">نقل الطلاب</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/admin/students">إدارة الطلاب</Link>
        </Button>
      </div>
    </FeatureShell>
  );
}
