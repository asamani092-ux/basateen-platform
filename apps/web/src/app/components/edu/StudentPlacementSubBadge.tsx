import { StudentCircleBadge } from "./StudentCircleBadge";
import { StudentTrackBadge } from "./StudentTrackBadge";

type Props = {
  circleName?: string | null;
  trackName?: string | null;
  /** السياق الأساسي: حلقة المعلم أو مسار المشرف */
  view: "circle" | "track";
  className?: string;
};

/** شارة التنسيب الآخر — تحت اسم الطالب (حلقة في عرض المسار، ومسار في عرض الحلقة) */
export function StudentPlacementSubBadge({
  circleName,
  trackName,
  view,
  className,
}: Props) {
  if (view === "track") {
    return <StudentCircleBadge circleName={circleName ?? ""} className={className} />;
  }
  return <StudentTrackBadge trackName={trackName ?? ""} className={className} />;
}
