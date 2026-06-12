import { lazy, type ComponentType } from "react";

function lazyNamed<T extends Record<string, ComponentType<object>>>(
  loader: () => Promise<T>,
  exportName: keyof T,
) {
  return lazy(() =>
    loader().then((module) => ({ default: module[exportName] as ComponentType<object> })),
  );
}

/** Admin section — code-split from teacher initial bundle */
export const StaffManagementPage = lazyNamed(
  () => import("../pages/admin/StaffManagementPage"),
  "StaffManagementPage",
);
export const CirclesSetupPage = lazyNamed(
  () => import("../pages/admin/CirclesSetupPage"),
  "CirclesSetupPage",
);
export const AdminGeneralSettingsPage = lazyNamed(
  () => import("../pages/admin/AdminGeneralSettingsPage"),
  "AdminGeneralSettingsPage",
);
export const StudentsPage = lazyNamed(
  () => import("../pages/admin/StudentsPage"),
  "StudentsPage",
);
export const StaffAttendancePage = lazyNamed(
  () => import("../pages/admin-dept/StaffAttendancePage"),
  "StaffAttendancePage",
);
export const StudentDailyAttendancePage = lazyNamed(
  () => import("../pages/admin-dept/StudentDailyAttendancePage"),
  "StudentDailyAttendancePage",
);
export const AbsentWhatsappPage = lazyNamed(
  () => import("../pages/admin-dept/AbsentWhatsappPage"),
  "AbsentWhatsappPage",
);
export const PledgesPage = lazyNamed(
  () => import("../pages/admin-dept/PledgesPage"),
  "PledgesPage",
);
export const AdminReportsPage = lazyNamed(
  () => import("../pages/admin-dept/AdminReportsPage"),
  "AdminReportsPage",
);

/** Edu supervisor section — code-split from teacher initial bundle */
export const EduSettingsPage = lazyNamed(
  () => import("../pages/edu-dept/EduSettingsPage"),
  "EduSettingsPage",
);
export const EduReportsPage = lazyNamed(
  () => import("../pages/edu-dept/EduReportsPage"),
  "EduReportsPage",
);
export const EduTransfersPage = lazyNamed(
  () => import("../pages/edu-dept/EduTransfersPage"),
  "EduTransfersPage",
);
export const CompetitionsPage = lazyNamed(
  () => import("../pages/edu-supervisor/CompetitionsPage"),
  "CompetitionsPage",
);
export const CompetitionDetailPage = lazyNamed(
  () => import("../pages/edu-supervisor/CompetitionDetailPage"),
  "CompetitionDetailPage",
);
