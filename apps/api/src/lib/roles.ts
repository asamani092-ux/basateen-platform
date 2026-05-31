import type { UserRole } from "../types";

export const ALL_ROLES: UserRole[] = [
  "super_admin",
  "edu_supervisor",
  "admin_supervisor",
  "prog_supervisor",
  "track_supervisor",
  "teacher",
];

export const STAFF_ROLES: UserRole[] = [
  "super_admin",
  "edu_supervisor",
  "admin_supervisor",
  "prog_supervisor",
];

export const EDU_ROLES: UserRole[] = ["edu_supervisor", "super_admin"];

export const FIELD_EDU_ROLES: UserRole[] = ["edu_supervisor"];

export const PROG_ROLES: UserRole[] = ["prog_supervisor", "super_admin"];

export const ADMIN_DATA_ROLES: UserRole[] = ["edu_supervisor", "super_admin"];

export const ADMIN_SUPERVISOR_ROLES: UserRole[] = ["admin_supervisor"];

export const BROADCAST_ROLES: UserRole[] = [
  "super_admin",
  "edu_supervisor",
  "admin_supervisor",
];
