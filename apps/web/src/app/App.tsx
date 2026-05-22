import { Navigate, Route, Routes } from "react-router";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { TeacherLayout } from "./layouts/TeacherLayout";
import { RequireAuth } from "./components/RequireAuth";
import { RequireRole } from "./components/RequireRole";
import { RootRedirect } from "./components/RootRedirect";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/auth/LoginPage";
import { TvLivePage } from "./pages/tv/TvLivePage";
import { TeacherHomePage } from "./pages/teacher/TeacherHomePage";
import { StudentsPage } from "./pages/admin/StudentsPage";
import { ProgramsHomePage } from "./pages/programs/ProgramsHomePage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/tv-live" element={<TvLivePage />} />

      <Route element={<RequireAuth />}>
        <Route index element={<RootRedirect />} />

        <Route element={<RequireRole roles={["general_manager", "supervisor"]} />}>
          <Route element={<DashboardLayout />}>
            <Route path="dashboard" element={<HomePage />} />
            <Route path="admin/students" element={<StudentsPage />} />
            <Route
              path="admin/circles"
              element={<PlaceholderPage title="الحلقات والمسارات" />}
            />
            <Route
              path="admin/transfers"
              element={<PlaceholderPage title="نقل الطلاب" />}
            />
            <Route
              path="admin/violations"
              element={<PlaceholderPage title="التعهدات والمخالفات" />}
            />
            <Route
              path="education/tasks"
              element={<PlaceholderPage title="المهام التعليمية" />}
            />
            <Route
              path="education/daily-log"
              element={<PlaceholderPage title="الرصد اليومي" />}
            />
            <Route
              path="education/competition"
              element={<PlaceholderPage title="المنافسة والدرجات" />}
            />
            <Route
              path="education/himma"
              element={<PlaceholderPage title="يوم الهمة" />}
            />
            <Route path="programs" element={<ProgramsHomePage />} />
            <Route
              path="programs/quizzes"
              element={<PlaceholderPage title="الاختبارات" />}
            />
            <Route
              path="programs/archive"
              element={<PlaceholderPage title="الأرشيف والبرامج" />}
            />
          </Route>
        </Route>

        <Route element={<RequireRole roles={["teacher"]} />}>
          <Route element={<TeacherLayout />}>
            <Route path="teacher" element={<TeacherHomePage />} />
            <Route
              path="teacher/daily-log"
              element={<PlaceholderPage title="الرصد اليومي — المعلم" />}
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
