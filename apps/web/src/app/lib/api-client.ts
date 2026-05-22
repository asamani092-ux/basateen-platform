import { getApiToken } from "./api-token";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export type TvSummary = {
  complex: string;
  date: string | null;
  present: number;
  absent: number;
  attendance_rate: number;
  active_circles: number;
  updated_at: string;
};

export type AuthUser = {
  id: number;
  email: string;
  full_name_ar: string;
  role: string;
  sections: string[];
};

export type StudentRow = {
  id: number;
  full_name_ar: string;
  phone: string | null;
  circle_name: string | null;
  track_name: string | null;
};

export type CircleOption = {
  id: number;
  name_ar: string;
  capacity: number;
  track_id: number | null;
  track_name: string | null;
};

export type StudentPlacement = {
  history_id: number;
  circle_id: number;
  circle_name: string;
  track_id: number | null;
  track_name: string | null;
  from_at: string;
  to_at: string | null;
};

export type HistoryRow = {
  id: number;
  circle_name: string;
  track_name: string | null;
  from_at: string;
  to_at: string | null;
  frozen_at: string | null;
  note: string | null;
};

export type StudentDetail = {
  student: { id: number; full_name_ar: string; phone: string | null };
  current: StudentPlacement | null;
  history: HistoryRow[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE.replace(/\/$/, "")}${path}`;
  const token = getApiToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string; message?: string }).error ??
        (body as { message?: string }).message ??
        `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; service?: string }>("/api/health"),
  tvSummary: () => request<TvSummary>("/api/tv/summary"),
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: AuthUser }>("/api/auth/me"),
  students: (q?: string) => {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    const qs = params.toString();
    return request<{ items: StudentRow[]; count: number }>(
      `/api/students${qs ? `?${qs}` : ""}`,
    );
  },
  circles: () => request<{ items: CircleOption[] }>("/api/circles"),
  studentDetail: (id: number) =>
    request<StudentDetail>(`/api/students/${id}`),
  transferStudent: (
    id: number,
    body: { circle_id: number; note?: string },
  ) =>
    request<{ ok: boolean; message: string; placement: StudentPlacement }>(
      `/api/students/${id}/transfer`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
