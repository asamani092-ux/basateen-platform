import { ClipboardList } from "lucide-react";
import {
  RecitationHubShell,
  type RecitationHubTab,
} from "../../components/edu/RecitationHubShell";
import { DailyRecitationPage } from "../edu-dept/DailyRecitationPage";

type HubTab = "daily";

const TABS: RecitationHubTab<HubTab>[] = [
  {
    id: "daily",
    label: "الرصد اليومي",
    shortLabel: "الرصد",
    icon: ClipboardList,
    panel: <DailyRecitationPage embedded />,
  },
];

function parseTab(_raw: string | null): HubTab {
  return "daily";
}

export function TrackSupervisorHubPage() {
  return (
    <RecitationHubShell
      title="بوابة مشرف المسار"
      description="رصد حلقات مسارك — من مكان واحد."
      navAriaLabel="تنقل بوابة مشرف المسار"
      tabs={TABS}
      defaultTab="daily"
      parseTab={parseTab}
    />
  );
}
