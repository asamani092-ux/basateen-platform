export type UserRole =
  | "teacher"
  | "edu_supervisor"
  | "prog_supervisor"
  | "general_supervisor"
  | "general_manager";

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  SETUP_KEY?: string;
  ENVIRONMENT?: string;
  /** قائمة دومينات Pages مفصولة بفاصلة، مثال: https://basateen.pages.dev */
  CORS_ALLOWED_ORIGINS?: string;
}

export interface UserRow {
  id: number;
  email: string;
  mobile: string | null;
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
