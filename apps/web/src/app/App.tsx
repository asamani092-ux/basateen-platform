import { Navigate, Route, Routes } from "react-router";
import { RoleShellLayout } from "./layouts/RoleShellLayout";
import { TeacherLayout } from "./layouts/TeacherLayout";
import { EduSupervisorLayout } from "./layouts/EduSupervisorLayout";
import { RequireAuth } from "./components/RequireAuth";
import { RequireRole } from "./components/RequireRole";
import { RequirePathAccess } from "./components/RequirePathAccess";
import { AuthHomeRedirect } from "./components/AuthHomeRedirect";
import { LoginPage } from "./pages/auth/LoginPage";
import { WelcomePage } from "./pages/WelcomePage";
import { TvLivePage } from "./pages/tv/TvLivePage";
import { LiveLogPage } from "./pages/live-log/LiveLogPage";
import { TeacherHubPage } from "./pages/teacher/TeacherHubPage";
import { MasterGridConsole } from "./pages/edu-supervisor/MasterGridConsole";
import { EventsEngineConsole } from "./pages/edu-supervisor/EventsEngineConsole";
import { StudentsPage } from "./pages/admin/StudentsPage";
import { TransfersPage } from "./pages/admin/TransfersPage";
import { AdminCirclesPage } from "./pages/admin/AdminCirclesPage";
import { EduDashboardPage } from "./pages/edu-supervisor/EduDashboardPage";
import { CompetitionDetailPage } from "./pages/edu-supervisor/CompetitionDetailPage";
import { StudentProfilePage } from "./pages/edu-supervisor/StudentProfilePage";
import { ProgSupervisorLayout } from "./layouts/ProgSupervisorLayout";
import { ProgQuizzesPage } from "./pages/prog-supervisor/ProgQuizzesPage";
import { QuizEditorPage } from "./pages/prog-supervisor/QuizEditorPage";
import { QuizPrintPage } from "./pages/prog-supervisor/QuizPrintPage";
import { ProgAnalyticsPage } from "./pages/prog-supervisor/ProgAnalyticsPage";
import { ProgVaultPage } from "./pages/prog-supervisor/ProgVaultPage";
import { QuizPublicPage } from "./pages/quiz/QuizPublicPage";
import { PublicMagicLinkPage } from "./pages/public/PublicMagicLinkPage";
import { StaffAttendancePage } from "./pages/admin-dept/StaffAttendancePage";
import { StudentDailyAttendancePage } from "./pages/admin-dept/StudentDailyAttendancePage";
import { AbsentWhatsappPage } from "./pages/admin-dept/AbsentWhatsappPage";
import { AdmissionPage } from "./pages/admin-dept/AdmissionPage";
import { PledgesPage } from "./pages/admin-dept/PledgesPage";
import { AdminReportsPage } from "./pages/admin-dept/AdminReportsPage";
import { StaffManagementPage } from "./pages/admin/StaffManagementPage";
import { CirclesSetupPage } from "./pages/admin/CirclesSetupPage";
import { StatisticsPage } from "./pages/admin/StatisticsPage";
import { STAFF_ROLES } from "./config/role-access";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/tv-live" element={<TvLivePage />} />
      <Route path="/live-log/:token" element={<LiveLogPage />} />
      <Route path="/quiz/:quizId" element={<QuizPublicPage />} />
      <Route path="/public/attendance/:token" element={<PublicMagicLinkPage />} />

      <Route element={<RequireAuth />}>
        <Route path="welcome" element={<WelcomePage />} />
        <Route index element={<AuthHomeRedirect />} />

        <Route element={<RequireRole roles={["teacher"]} />}>
          <Route element={<TeacherLayout />}>
            <Route path="teacher" element={<TeacherHubPage />} />
            <Route path="teacher/daily-log" element={<Navigate to="/teacher" replace />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={STAFF_ROLES} />}>
          <Route element={<RequirePathAccess />}>
            <Route element={<RoleShellLayout />}>
              <Route path="super-admin/staff" element={<StaffManagementPage />} />
              <Route
                path="super-admin/staff-management"
                element={<Navigate to="/super-admin/staff" replace />}
              />
              <Route path="super-admin/circles-setup" element={<CirclesSetupPage />} />
              <Route path="super-admin/statistics" element={<StatisticsPage />} />

              <Route path="edu-dept" element={<EduSupervisorLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<EduDashboardPage />} />
                <Route path="master-grid" element={<MasterGridConsole />} />
                <Route path="students" element={<StudentsPage />} />
                <Route path="students/:studentId" element={<StudentProfilePage />} />
                <Route path="transfers" element={<TransfersPage />} />
                <Route path="circles" element={<AdminCirclesPage />} />
                <Route path="events-engine" element={<EventsEngineConsole />} />
                <Route
                  path="competitions/:competitionId"
                  element={<CompetitionDetailPage />}
                />
              </Route>

              <Route path="admin-dept/staff-attendance" element={<StaffAttendancePage />} />
              <Route path="admin-dept/student-attendance" element={<StudentDailyAttendancePage />} />
              <Route path="admin-dept/absent-whatsapp" element={<AbsentWhatsappPage />} />
              <Route path="admin-dept/admissions" element={<AdmissionPage />} />
              <Route path="admin-dept/pledges" element={<PledgesPage />} />
              <Route path="admin-dept/reports" element={<AdminReportsPage />} />

              <Route path="prog-dept" element={<ProgSupervisorLayout />}>
                <Route index element={<Navigate to="quizzes" replace />} />
                <Route path="quizzes" element={<ProgQuizzesPage />} />
                <Route path="quizzes/:quizId" element={<QuizEditorPage />} />
                <Route path="quizzes/:quizId/print" element={<QuizPrintPage />} />
                <Route path="analytics" element={<ProgAnalyticsPage />} />
                <Route path="vault" element={<ProgVaultPage />} />
              </Route>

              <Route path="admin/staff" element={<Navigate to="/super-admin/staff" replace />} />
              <Route path="admin/circles-setup" element={<Navigate to="/super-admin/circles-setup" replace />} />
              <Route path="admin/statistics" element={<Navigate to="/super-admin/statistics" replace />} />
              <Route path="edu-supervisor/*" element={<Navigate to="/edu-dept/dashboard" replace />} />
              <Route path="general-supervisor/*" element={<Navigate to="/admin-dept/staff-attendance" replace />} />
              <Route path="prog-supervisor/*" element={<Navigate to="/prog-dept/quizzes" replace />} />
              <Route path="admin-dept/dashboard" element={<Navigate to="/admin-dept/reports" replace />} />
              <Route path="admin-dept/violations" element={<Navigate to="/admin-dept/pledges" replace />} />
              <Route path="dashboard" element={<AuthHomeRedirect />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
