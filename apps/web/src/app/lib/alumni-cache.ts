const KEY = "basateen_alumni_stats";

export type AlumniStats = {
  graduates_count: number;
  huffadh_count: number;
};

export function getAlumniCache(): AlumniStats {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { graduates_count: 0, huffadh_count: 0 };
    return JSON.parse(raw) as AlumniStats;
  } catch {
    return { graduates_count: 0, huffadh_count: 0 };
  }
}

export function setAlumniCache(data: AlumniStats): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}
