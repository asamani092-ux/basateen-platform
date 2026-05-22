import { Navigate, Route, Routes } from "react-router";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { RequireAuth } from "./components/RequireAuth";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/auth/LoginPage";
import { StudentsPage } from "./pages/admin/StudentsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<HomePage />} />
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
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
