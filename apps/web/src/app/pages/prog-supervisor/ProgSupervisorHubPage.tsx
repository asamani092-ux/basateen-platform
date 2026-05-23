import { useSearchParams } from "react-router";
import { HubTabs } from "../../components/hub/HubTabs";
import { ProgramsHomePage } from "../programs/ProgramsHomePage";
import { ProgramsQuizzesPage } from "../programs/ProgramsQuizzesPage";
import { ProgramsArchivePage } from "../programs/ProgramsArchivePage";
import { ds, tajawal } from "../../lib/design-system";

const TABS = [
  { id: "programs", label: "البرامج" },
  { id: "quizzes", label: "الاختبارات" },
  { id: "archive", label: "الأرشيف" },
] as const;

export function ProgSupervisorHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "programs";

  function setTab(id: string) {
    setSearchParams(id === "programs" ? {} : { tab: id });
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          إدارة البرامج
        </h2>
        <p className={ds.page.description} style={tajawal}>
          اختبارات، برامج، وأرشيف — داخل تبويبات واحدة
        </p>
      </div>
      <HubTabs tabs={[...TABS]} active={tab} onChange={setTab} />
      {tab === "programs" && <ProgramsHomePage />}
      {tab === "quizzes" && <ProgramsQuizzesPage />}
      {tab === "archive" && <ProgramsArchivePage />}
    </div>
  );
}
