import { Navigate, Route, Routes } from "react-router";
import { RoleShellLayout } from "./layouts/RoleShellLayout";
import { EduSupervisorLayout } from "./layouts/EduSupervisorLayout";
import { RequireAuth } from "./components/RequireAuth";
import { RequireRole } from "./components/RequireRole";
import { RequirePathAccess } from "./components/RequirePathAccess";
import { AuthHomeRedirect } from "./components/AuthHomeRedirect";
import { LazyRoute } from "./components/shared/LazyRoute";
import { LoginPage } from "./pages/auth/LoginPage";
import { WelcomePage } from "./pages/WelcomePage";
import { TvLivePage } from "./pages/tv/TvLivePage";
import { LiveLogPage } from "./pages/live-log/LiveLogPage";
import { DailyRecitationPage } from "./pages/edu-dept/DailyRecitationPage";
import { TeacherCompetitionsPage } from "./pages/edu-dept/TeacherCompetitionsPage";
import { PublicQuranicDayPage } from "./pages/public/PublicQuranicDayPage";
import { ProgSupervisorLayout } from "./layouts/ProgSupervisorLayout";
import { QuizBuilderPage } from "./pages/prog-dept/QuizBuilderPage";
import { ProgramsArchivePage } from "./pages/prog-dept/ProgramsArchivePage";
import { QuizEditorPage } from "./pages/prog-supervisor/QuizEditorPage";
import { QuizPrintPage } from "./pages/prog-supervisor/QuizPrintPage";
import { ProgAnalyticsPage } from "./pages/prog-supervisor/ProgAnalyticsPage";
import { DisplayManagerPage } from "./pages/display-dept/DisplayManagerPage";
import { PublicQuizPage } from "./pages/public/PublicQuizPage";
import { PublicLiveDisplayPage } from "./pages/public/PublicLiveDisplayPage";
import { QuizPublicPage } from "./pages/quiz/QuizPublicPage";
import { PublicMagicLinkPage } from "./pages/public/PublicMagicLinkPage";
import {
  AbsentWhatsappPage,
  AdminGeneralSettingsPage,
  AdminReportsPage,
  CirclesSetupPage,
  CompetitionDetailPage,
  CompetitionsPage,
  EduReportsPage,
  EduSettingsPage,
  EduTransfersPage,
  PledgesPage,
  StaffAttendancePage,
  StaffManagementPage,
  StudentDailyAttendancePage,
  StudentsPage,
} from "./lib/lazy-pages";
import { STAFF_ROLES } from "./config/role-access";
import { TeacherHubPage } from "./pages/teacher/TeacherHubPage";
import { TrackSupervisorHubPage } from "./pages/teacher/TrackSupervisorHubPage";
import { StudentProfilePage } from "./pages/edu-supervisor/StudentProfilePage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/tv-live" element={<TvLivePage />} />
      <Route path="/live-log/:token" element={<LiveLogPage />} />
      <Route path="/quiz/:quizId" element={<QuizPublicPage />} />
      <Route path="/public/quiz/:id" element={<PublicQuizPage />} />
      <Route path="/public/live-display" element={<PublicLiveDisplayPage />} />
      <Route path="/public/attendance/:token" element={<PublicMagicLinkPage />} />
      <Route path="/public/quranic-day/:token" element={<PublicQuranicDayPage />} />

      <Route element={<RequireAuth />}>
        <Route path="welcome" element={<WelcomePage />} />
        <Route index element={<AuthHomeRedirect />} />

        <Route element={<RequireRole roles={[...STAFF_ROLES, "teacher"]} />}>
          <Route element={<RequirePathAccess />}>
            <Route element={<RoleShellLayout />}>
              <Route
                path="super-admin/staff"
                element={
                  <LazyRoute>
                    <StaffManagementPage />
                  </LazyRoute>
                }
              />
              <Route
                path="super-admin/staff-management"
                element={<Navigate to="/super-admin/staff" replace />}
              />
              <Route
                path="super-admin/circles-setup"
                element={
                  <LazyRoute>
                    <CirclesSetupPage />
                  </LazyRoute>
                }
              />
              <Route
                path="super-admin/settings"
                element={
                  <LazyRoute>
                    <AdminGeneralSettingsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="super-admin/statistics"
                element={<Navigate to="/admin-dept/reports" replace />}
              />

              <Route path="edu-dept" element={<EduSupervisorLayout />}>
                <Route index element={<Navigate to="reports" replace />} />
                <Route
                  path="settings"
                  element={
                    <LazyRoute>
                      <EduSettingsPage />
                    </LazyRoute>
                  }
                />
                <Route path="daily-recitation" element={<DailyRecitationPage />} />
                <Route path="teacher-competitions" element={<TeacherCompetitionsPage />} />
                <Route
                  path="quranic-days"
                  element={<Navigate to="/edu-dept/competitions" replace />}
                />
                <Route
                  path="reports"
                  element={
                    <LazyRoute>
                      <EduReportsPage />
                    </LazyRoute>
                  }
                />
                <Route
                  path="transfer-requests"
                  element={<Navigate to="/edu-dept/transfers" replace />}
                />
                <Route
                  path="dashboard"
                  element={<Navigate to="/edu-dept/reports" replace />}
                />
                <Route
                  path="master-grid"
                  element={<Navigate to="/edu-dept/transfers" replace />}
                />
                <Route
                  path="students"
                  element={<Navigate to="/admin-dept/students" replace />}
                />
                <Route
                  path="students/:studentId"
                  element={<StudentProfilePage />}
                />
                <Route
                  path="transfers"
                  element={
                    <LazyRoute>
                      <EduTransfersPage />
                    </LazyRoute>
                  }
                />
                <Route
                  path="circles"
                  element={<Navigate to="/super-admin/circles-setup" replace />}
                />
                <Route
                  path="competitions"
                  element={
                    <LazyRoute>
                      <CompetitionsPage />
                    </LazyRoute>
                  }
                />
                <Route
                  path="events-engine"
                  element={<Navigate to="/edu-dept/competitions" replace />}
                />
                <Route
                  path="competitions/:competitionId"
                  element={
                    <LazyRoute>
                      <CompetitionDetailPage />
                    </LazyRoute>
                  }
                />
              </Route>

              <Route path="teacher" element={<TeacherHubPage />} />
              <Route path="teacher/*" element={<TeacherHubPage />} />

              <Route path="track-supervisor" element={<TrackSupervisorHubPage />} />
              <Route path="track-supervisor/*" element={<TrackSupervisorHubPage />} />

              <Route
                path="admin-dept/students"
                element={
                  <LazyRoute>
                    <StudentsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="admin-dept/staff-attendance"
                element={
                  <LazyRoute>
                    <StaffAttendancePage />
                  </LazyRoute>
                }
              />
              <Route
                path="admin-dept/student-attendance"
                element={
                  <LazyRoute>
                    <StudentDailyAttendancePage />
                  </LazyRoute>
                }
              />
              <Route
                path="admin-dept/absent-whatsapp"
                element={
                  <LazyRoute>
                    <AbsentWhatsappPage />
                  </LazyRoute>
                }
              />
              <Route
                path="admin-dept/admissions"
                element={<Navigate to="/admin-dept/students" replace />}
              />
              <Route
                path="admin-dept/pledges"
                element={
                  <LazyRoute>
                    <PledgesPage />
                  </LazyRoute>
                }
              />
              <Route
                path="admin-dept/reports"
                element={
                  <LazyRoute>
                    <AdminReportsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="admin-dept/magic-links"
                element={<Navigate to="/admin-dept/student-attendance" replace />}
              />

              <Route path="prog-dept" element={<ProgSupervisorLayout />}>
                <Route index element={<Navigate to="quizzes" replace />} />
                <Route path="quizzes" element={<QuizBuilderPage />} />
                <Route path="quizzes/:quizId" element={<QuizEditorPage />} />
                <Route path="quizzes/:quizId/print" element={<QuizPrintPage />} />
                <Route path="archive" element={<ProgramsArchivePage />} />
                <Route path="vault" element={<Navigate to="/prog-dept/archive" replace />} />
                <Route path="analytics" element={<ProgAnalyticsPage />} />
              </Route>

              <Route path="display-dept/manager" element={<DisplayManagerPage />} />

              <Route path="admin/staff" element={<Navigate to="/super-admin/staff" replace />} />
              <Route path="admin/circles-setup" element={<Navigate to="/super-admin/circles-setup" replace />} />
              <Route path="admin/statistics" element={<Navigate to="/admin-dept/reports" replace />} />
              <Route path="edu-supervisor/*" element={<Navigate to="/edu-dept/reports" replace />} />
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
