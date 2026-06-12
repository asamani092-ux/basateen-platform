import { BookOpen, ClipboardList, Trophy } from "lucide-react";
import {
  RecitationHubShell,
  type RecitationHubTab,
} from "../../components/edu/RecitationHubShell";
import { DailyRecitationPage } from "../edu-dept/DailyRecitationPage";
import { TeacherCompetitionsPage } from "../edu-dept/TeacherCompetitionsPage";
import { ds, tajawal } from "../../lib/design-system";

type HubTab = "daily" | "plans" | "competitions";

function SemesterPlanPlaceholder() {
  return (
    <div
      className={`${ds.card} flex flex-col items-center justify-center gap-4 p-10 text-center`}
      dir="rtl"
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary/60 text-primary">
        <BookOpen className="size-8" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground" style={tajawal}>
          خطة الفصل
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm" style={tajawal}>
          ستتوفر هنا أهداف الحفظ والمراجعة لكل طالب — قريباً.
        </p>
      </div>
    </div>
  );
}

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
    panel: <SemesterPlanPlaceholder />,
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
