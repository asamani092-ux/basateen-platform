import { ClipboardList, Trophy } from "lucide-react";
import {
  RecitationHubShell,
  type RecitationHubTab,
} from "../../components/edu/RecitationHubShell";
import { DailyRecitationPage } from "../edu-dept/DailyRecitationPage";
import { TeacherCompetitionsPage } from "../edu-dept/TeacherCompetitionsPage";

type HubTab = "daily" | "competitions";

const TABS: RecitationHubTab<HubTab>[] = [
  {
    id: "daily",
    label: "الرصد اليومي",
    shortLabel: "الرصد",
    icon: ClipboardList,
    panel: <DailyRecitationPage embedded />,
  },
  {
    id: "competitions",
    label: "منافسات الحلقة",
    shortLabel: "المنافسات",
    icon: Trophy,
    panel: <TeacherCompetitionsPage embedded />,
  },
];

function parseTab(raw: string | null): HubTab {
  return raw === "competitions" ? "competitions" : "daily";
}

export function TrackSupervisorHubPage() {
  return (
    <RecitationHubShell
      title="بوابة مشرف المسار"
      description="رصد حلقات مسارك ومنافساتها — من مكان واحد."
      navAriaLabel="تنقل بوابة مشرف المسار"
      tabs={TABS}
      defaultTab="daily"
      parseTab={parseTab}
    />
  );
}
