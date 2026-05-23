import type { UserRole } from "../types";

export const ALL_ROLES: UserRole[] = [
  "teacher",
  "edu_supervisor",
  "prog_supervisor",
  "general_supervisor",
  "general_manager",
];

/** Staff who use dashboard shell (not teacher-only) */
export const STAFF_ROLES: UserRole[] = [
  "edu_supervisor",
  "prog_supervisor",
  "general_supervisor",
  "general_manager",
];

export const EDU_ROLES: UserRole[] = [
  "edu_supervisor",
  "general_manager",
];

/** تشغيل ميداني — المشرف التعليمي فقط */
export const FIELD_EDU_ROLES: UserRole[] = ["edu_supervisor"];

export const PROG_ROLES: UserRole[] = ["prog_supervisor", "general_manager"];

export const ADMIN_DATA_ROLES: UserRole[] = [
  "edu_supervisor",
  "general_manager",
];

export const GENERAL_SUPERVISOR_ROLES: UserRole[] = ["general_supervisor"];
