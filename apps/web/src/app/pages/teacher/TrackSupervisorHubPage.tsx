import { BookOpen, ClipboardList } from "lucide-react";
import {
  RecitationHubShell,
  type RecitationHubTab,
} from "../../components/edu/RecitationHubShell";
import { DailyRecitationPage } from "../edu-dept/DailyRecitationPage";
import { TeacherPlansPage } from "./TeacherPlansPage";

type HubTab = "daily" | "plans";

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
];

function parseTab(raw: string | null): HubTab {
  if (raw === "plans") return "plans";
  return "daily";
}

export function TrackSupervisorHubPage() {
  return (
    <RecitationHubShell
      title="بوابة مشرف المسار"
      description="رصد طلاب مسارك وخطط الفصل — تظهر حلقة كل طالب تلقائياً."
      navAriaLabel="تنقل بوابة مشرف المسار"
      tabs={TABS}
      defaultTab="daily"
      parseTab={parseTab}
    />
  );
}
