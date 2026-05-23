export type DailyMetrics = {
  hifz: {
    heard: boolean;
    repeated: boolean;
    errors: number;
    alerts: number;
  };
  muraja: {
    read: boolean;
    errors: number;
    alerts: number;
  };
  rabt: {
    read: boolean;
    faces_done: number;
  };
};

export function emptyDailyMetrics(): DailyMetrics {
  return {
    hifz: { heard: false, repeated: false, errors: 0, alerts: 0 },
    muraja: { read: false, errors: 0, alerts: 0 },
    rabt: { read: false, faces_done: 0 },
  };
}

export function applyRabtFromPlan(
  metrics: DailyMetrics,
  dailyRabtFaces: number,
): DailyMetrics {
  if (!metrics.rabt.read) {
    return { ...metrics, rabt: { read: false, faces_done: 0 } };
  }
  return {
    ...metrics,
    rabt: {
      read: true,
      faces_done: dailyRabtFaces > 0 ? dailyRabtFaces : metrics.rabt.faces_done,
    },
  };
}

export function scoreFromMetrics(metrics: DailyMetrics): number {
  let score = 0;
  if (metrics.hifz.heard) score += 3;
  if (metrics.hifz.repeated) score += 2;
  if (metrics.muraja.read) score += 3;
  if (metrics.rabt.read) score += 2;
  score -= Math.min(5, metrics.hifz.errors + metrics.muraja.errors);
  return Math.max(0, Math.min(10, score));
}

export function hasAnyActivity(metrics: DailyMetrics): boolean {
  return (
    metrics.hifz.heard ||
    metrics.hifz.repeated ||
    metrics.muraja.read ||
    metrics.rabt.read
  );
}
