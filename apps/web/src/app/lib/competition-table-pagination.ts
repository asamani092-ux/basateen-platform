/** حجم الصفحة الافتراضي لجداول المنافسة — O(1) عرض ثابت بغض النظر عن العدد الكلي */
export const COMPETITION_TABLE_PAGE_SIZE = 25;

/** دفعة عرض المزيد لجدول ترتيب الطلاب */
export const COMPETITION_LEADERBOARD_BATCH_SIZE = 20;

export type PaginatedSlice<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_prev: boolean;
  has_next: boolean;
};

/** O(n) — n = |items|؛ يُرجع شريحة الصفحة الحالية فقط */
export function paginateSlice<T>(
  items: T[],
  page: number,
  pageSize = COMPETITION_TABLE_PAGE_SIZE,
): PaginatedSlice<T> {
  const total = items.length;
  const total_pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), total_pages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    page_size: pageSize,
    total,
    total_pages,
    has_prev: safePage > 1,
    has_next: safePage < total_pages,
  };
}

type LeaderAchievementRow = {
  full_name_ar?: string;
  mastery_pct?: number;
  overall_pct?: number;
  achievement_pct?: number;
};

/** نسبة الإنجاز حسب فئة المنافسة — نفس مقياس المحرك */
export function leaderAchievementPct(
  row: LeaderAchievementRow,
  isRecitation: boolean,
): number {
  return isRecitation
    ? (row.mastery_pct ?? 0)
    : (row.overall_pct ?? row.achievement_pct ?? 0);
}

/**
 * O(n log n) — ترتيب تنازلي بالإنجاز؛ عند التعادل: الاسم العربي تصاعدياً (محدّد).
 */
export function sortLeadersByAchievement<T extends LeaderAchievementRow>(
  leaders: T[],
  isRecitation: boolean,
): T[] {
  return [...leaders].sort((a, b) => {
    const diff =
      leaderAchievementPct(b, isRecitation) - leaderAchievementPct(a, isRecitation);
    if (diff !== 0) return diff;
    const nameA = a.full_name_ar ?? "";
    const nameB = b.full_name_ar ?? "";
    return nameA.localeCompare(nameB, "ar");
  });
}

/** O(n) — شريحة تراكمية لدفعات عرض المزيد (تعتمد paginateSlice للبيانات الوصفية) */
export function cumulativeBatchSlice<T>(
  items: T[],
  batches: number,
  batchSize = COMPETITION_LEADERBOARD_BATCH_SIZE,
): PaginatedSlice<T> & { has_more: boolean } {
  const meta = paginateSlice(items, 1, batchSize);
  const visibleCount = Math.min(batches * batchSize, items.length);
  return {
    items: items.slice(0, visibleCount),
    page: batches,
    page_size: batchSize,
    total: meta.total,
    total_pages: meta.total_pages,
    has_prev: batches > 1,
    has_next: visibleCount < meta.total,
    has_more: visibleCount < meta.total,
  };
}

type ScopeIds = {
  circle_ids?: number[];
  track_ids?: number[];
};

/** O(C+T) — تسمية نطاق الحلقة/المسار للطباعة */
export function resolveCompetitionScopeLabel(
  targetScope: ScopeIds | null | undefined,
  circles: Array<{ id: number; name_ar: string }>,
  tracks: Array<{ id: number; name_ar: string }>,
): string | null {
  const parts: string[] = [];
  for (const cid of targetScope?.circle_ids ?? []) {
    const row = circles.find((c) => c.id === cid);
    if (row?.name_ar?.trim()) parts.push(`حلقة: ${row.name_ar.trim()}`);
  }
  for (const tid of targetScope?.track_ids ?? []) {
    const row = tracks.find((t) => t.id === tid);
    if (row?.name_ar?.trim()) parts.push(`مسار: ${row.name_ar.trim()}`);
  }
  return parts.length ? parts.join(" · ") : null;
}
