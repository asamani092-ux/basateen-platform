export type {
  UserRole,
  User,
  DbUserRow,
  Complex,
  Student,
  Session,
} from "../../../packages/types/schema";

export { resolveRoleFromUser } from "../../../packages/types/schema";

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  SETUP_KEY?: string;
  ENVIRONMENT?: string;
  /** رمز الوصول لـ /tv-live و /api/tv/summary */
  TV_ACCESS_TOKEN?: string;
  /** قائمة دومينات Pages مفصولة بفاصلة، مثال: https://basateen.pages.dev */
  CORS_ALLOWED_ORIGINS?: string;
}

/** Active user row returned from auth queries (RBAC schema) */
export interface UserRow {
  id: number;
  email: string;
  mobile: string | null;
  password_hash: string;
  role: import("../../../packages/types/schema").UserRole;
  full_name_ar: string;
  complex_id: number;
  is_active: number;
}

export interface AuthContext {
  userId: number;
  role: import("../../../packages/types/schema").UserRole;
  complexId: number;
}
