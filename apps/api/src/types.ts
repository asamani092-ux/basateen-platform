export type UserRole = "general_manager" | "supervisor" | "teacher";

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  full_name_ar: string;
  complex_id: number;
  is_active: number;
}

export interface AuthContext {
  userId: number;
  role: UserRole;
  complexId: number;
}
