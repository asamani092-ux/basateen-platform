import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { FeatureShell } from "../../components/_scaffold/FeatureShell";

export function QuizzesPage() {
  return (
    <FeatureShell
      title="منشئ الاختبارات والبرامج"
      description="بناء الاختبارات وإدارة البرامج التعليمية والترفيهية — درجات معزولة عن الدرجات القرآنية."
      badge="مشرف إدارة البرامج"
    >
      <Button asChild variant="default" className="rounded-xl">
        <Link to="/programs">بوابة البرامج</Link>
      </Button>
    </FeatureShell>
  );
}
