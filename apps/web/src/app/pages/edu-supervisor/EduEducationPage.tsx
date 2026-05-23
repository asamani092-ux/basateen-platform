import { EducationTasksPage } from "../education/EducationTasksPage";
import { CompetitionPage } from "../education/CompetitionPage";

export function EduEducationPage() {
  return (
    <div className="space-y-6">
      <EducationTasksPage />
      <CompetitionPage />
    </div>
  );
}
