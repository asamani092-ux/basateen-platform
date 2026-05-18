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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/api/health"),
  tvSummary: () => request<TvSummary>("/api/tv/summary"),
};
