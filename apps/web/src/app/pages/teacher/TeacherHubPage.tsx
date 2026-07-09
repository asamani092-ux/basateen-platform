import { BookOpen, ClipboardList, Trophy } from "lucide-react";
import {
  RecitationHubShell,
  type RecitationHubTab,
} from "../../components/edu/RecitationHubShell";
import { DailyRecitationPage } from "../edu-dept/DailyRecitationPage";
import { TeacherCompetitionsPage } from "../edu-dept/TeacherCompetitionsPage";
import { TeacherPlansPage } from "./TeacherPlansPage";

type HubTab = "daily" | "plans" | "competitions";

const TABS: RecitationHubTab<HubTab>[] = [
  {
    id: "daily",
    label: "الرصد اليومي",
    shortLabel: "الرصد",
    icon: ClipboardList,
    panel: <DailyRecitationPage embedded />,
  },
  {
    id: "plans",
    label: "خطة الفصل",
    shortLabel: "الخطة",
    icon: BookOpen,
    panel: <TeacherPlansPage />,
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
  if (raw === "plans" || raw === "competitions") return raw;
  return "daily";
}

export function TeacherHubPage() {
  return (
    <RecitationHubShell
      title="بوابة المعلم"
      description="الرصد اليومي، خطط الفصل، ومنافسات حلقتك — من مكان واحد."
      navAriaLabel="تنقل بوابة المعلم"
      tabs={TABS}
      defaultTab="daily"
      parseTab={parseTab}
    />
  );
}
