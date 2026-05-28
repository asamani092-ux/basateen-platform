import { useSearchParams } from "react-router";
import { HubTabs } from "../../components/hub/HubTabs";
import { DailyScorecardGrid } from "./DailyScorecardGrid";
import { TeacherPlansPage } from "./TeacherPlansPage";
import { ds, tajawal } from "../../lib/design-system";

const TABS = [
  { id: "daily", label: "شبكة الرصد السريع" },
  { id: "plans", label: "خطتي وإحصائياتي" },
];

export function TeacherHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "plans" ? "plans" : "daily";

  return (
    <div className="space-y-4">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          واجهة المعلم
        </h2>
        <p className={ds.page.description} style={tajawal}>
          أي رصد لطالب = حضور تلقائي لذلك اليوم
        </p>
      </div>
      <HubTabs
        tabs={TABS}
        active={tab}
        onChange={(id) => setSearchParams(id === "daily" ? {} : { tab: id })}
      />
      {tab === "daily" ? <DailyScorecardGrid /> : <TeacherPlansPage />}
    </div>
  );
}
