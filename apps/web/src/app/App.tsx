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
import { PlacementQueueTab } from "./pages/edu-supervisor/PlacementQueueTab";
import { StudentsPage } from "./pages/admin/StudentsPage";
import { TransfersPage } from "./pages/admin/TransfersPage";
import { AdminCirclesPage } from "./pages/admin/AdminCirclesPage";
import { EduDashboardPage } from "./pages/edu-supervisor/EduDashboardPage";
import { YomHimmaPage } from "./pages/edu-supervisor/YomHimmaPage";
import { CompetitionsPage } from "./pages/edu-supervisor/CompetitionsPage";
import { CompetitionDetailPage } from "./pages/edu-supervisor/CompetitionDetailPage";
import { StudentProfilePage } from "./pages/edu-supervisor/StudentProfilePage";
import { ProgSupervisorLayout } from "./layouts/ProgSupervisorLayout";
import { ProgQuizzesPage } from "./pages/prog-supervisor/ProgQuizzesPage";
import { QuizEditorPage } from "./pages/prog-supervisor/QuizEditorPage";
import { QuizPrintPage } from "./pages/prog-supervisor/QuizPrintPage";
import { ProgAnalyticsPage } from "./pages/prog-supervisor/ProgAnalyticsPage";
import { ProgVaultPage } from "./pages/prog-supervisor/ProgVaultPage";
import { QuizPublicPage } from "./pages/quiz/QuizPublicPage";
import { AdmissionFunnelTab } from "./pages/general-supervisor/AdmissionFunnelTab";
import { ViolationsPledgesTab } from "./pages/general-supervisor/ViolationsPledgesTab";
import { SupervisorDashboardTab } from "./pages/general-supervisor/SupervisorDashboardTab";
import { StaffAttendanceGridTab } from "./pages/general-supervisor/StaffAttendanceGridTab";
import { GsStudentAttendancePage } from "./pages/general-supervisor/GsStudentAttendancePage";
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

      <Route element={<RequireAuth />}>
        <Route path="welcome" element={<WelcomePage />} />
        <Route index element={<AuthHomeRedirect />} />

        <Route element={<RequireRole roles={["teacher"]} />}>
          <Route element={<TeacherLayout />}>
            <Route path="teacher" element={<TeacherHubPage />} />
            <Route
              path="teacher/daily-log"
              element={<Navigate to="/teacher" replace />}
            />
          </Route>
        </Route>

        <Route element={<RequireRole roles={STAFF_ROLES} />}>
          <Route element={<RequirePathAccess />}>
            <Route element={<RoleShellLayout />}>
              <Route path="admin/staff" element={<StaffManagementPage />} />
              <Route
                path="admin/staff-management"
                element={<Navigate to="/admin/staff" replace />}
              />
              <Route path="admin/circles-setup" element={<CirclesSetupPage />} />
              <Route path="admin/statistics" element={<StatisticsPage />} />

              <Route path="edu-supervisor" element={<EduSupervisorLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<EduDashboardPage />} />
                <Route
                  path="attendance"
                  element={<Navigate to="/edu-supervisor/dashboard" replace />}
                />
                <Route
                  path="education"
                  element={<Navigate to="/edu-supervisor/competitions" replace />}
                />
                <Route path="placement" element={<PlacementQueueTab />} />
                <Route path="students" element={<StudentsPage />} />
                <Route path="students/:studentId" element={<StudentProfilePage />} />
                <Route path="transfers" element={<TransfersPage />} />
                <Route path="circles" element={<AdminCirclesPage />} />
                <Route path="yom-himma" element={<YomHimmaPage />} />
                <Route path="master-grid" element={<SuperEduGridConsole />} />
                <Route path="competitions" element={<CompetitionsPage />} />
                <Route
                  path="competitions/:competitionId"
                  element={<CompetitionDetailPage />}
                />
              </Route>

              <Route path="prog-supervisor" element={<ProgSupervisorLayout />}>
                <Route index element={<Navigate to="quizzes" replace />} />
                <Route path="quizzes" element={<ProgQuizzesPage />} />
                <Route path="quizzes/:quizId" element={<QuizEditorPage />} />
                <Route path="quizzes/:quizId/print" element={<QuizPrintPage />} />
                <Route path="analytics" element={<ProgAnalyticsPage />} />
                <Route path="vault" element={<ProgVaultPage />} />
              </Route>

              <Route
                path="general-supervisor"
                element={<Navigate to="/general-supervisor/student-attendance" replace />}
              />
              <Route
                path="general-supervisor/student-attendance"
                element={<GsStudentAttendancePage />}
              />
              <Route
                path="general-supervisor/staff"
                element={<StaffAttendanceGridTab />}
              />
              <Route
                path="general-supervisor/admissions"
                element={<AdmissionFunnelTab />}
              />
              <Route
                path="general-supervisor/violations"
                element={<ViolationsPledgesTab />}
              />
              <Route
                path="general-supervisor/dashboard"
                element={<SupervisorDashboardTab />}
              />

              <Route
                path="admin/students"
                element={<Navigate to="/edu-supervisor/students" replace />}
              />
              <Route
                path="admin/students/import"
                element={
                  <Navigate to="/edu-supervisor/students?excel=1" replace />
                }
              />
              <Route
                path="admin/transfers"
                element={<Navigate to="/edu-supervisor/transfers" replace />}
              />
              <Route
                path="admin/circles"
                element={<Navigate to="/edu-supervisor/circles" replace />}
              />
              <Route
                path="admin/violations"
                element={<Navigate to="/general-supervisor/violations" replace />}
              />
              <Route
                path="education/himma"
                element={<Navigate to="/edu-supervisor/yom-himma" replace />}
              />
              <Route
                path="education/*"
                element={<Navigate to="/edu-supervisor/competitions" replace />}
              />
              <Route
                path="programs/*"
                element={<Navigate to="/prog-supervisor/quizzes" replace />}
              />
              <Route path="dashboard" element={<AuthHomeRedirect />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
