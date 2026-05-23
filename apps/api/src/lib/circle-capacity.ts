import type { Env } from "../types";

export const CAPACITY_ALERT_THRESHOLD = 3;

export type CircleCapacityInfo = {
  circle_id: number;
  default_capacity: number;
  student_count: number;
  seats_remaining: number;
  near_capacity: boolean;
  at_or_over_capacity: boolean;
  alert_level: "ok" | "near" | "full";
};

export function computeCapacity(
  defaultCapacity: number,
  studentCount: number,
): Omit<CircleCapacityInfo, "circle_id"> {
  const default_capacity = Math.max(1, defaultCapacity);
  const student_count = Math.max(0, studentCount);
  const seats_remaining = default_capacity - student_count;
  const at_or_over_capacity = student_count >= default_capacity;
  const near_capacity =
    !at_or_over_capacity && seats_remaining <= CAPACITY_ALERT_THRESHOLD;
  const alert_level: CircleCapacityInfo["alert_level"] = at_or_over_capacity
    ? "full"
    : near_capacity
      ? "near"
      : "ok";
  return {
    default_capacity,
    student_count,
    seats_remaining,
    near_capacity,
    at_or_over_capacity,
    alert_level,
  };
}

export async function getCircleCapacity(
  env: Env,
  circleId: number,
): Promise<CircleCapacityInfo | null> {
  const row = await env.DB.prepare(
    `SELECT c.id AS circle_id,
            COALESCE(c.default_capacity, c.capacity, 20) AS default_capacity,
            (SELECT COUNT(*) FROM student_circle_history h
             WHERE h.circle_id = c.id AND h.to_at IS NULL AND h.frozen_at IS NULL) AS student_count
     FROM circles c
     WHERE c.id = ? AND c.is_active = 1`,
  )
    .bind(circleId)
    .first<{
      circle_id: number;
      default_capacity: number;
      student_count: number;
    }>();

  if (!row) return null;

  const computed = computeCapacity(row.default_capacity, row.student_count);
  return { circle_id: row.circle_id, ...computed };
}

export function capacityWarningMessage(info: CircleCapacityInfo): string | null {
  if (info.at_or_over_capacity) {
    return `الحلقة مكتملة (${info.student_count}/${info.default_capacity}). يمكنك رفع السعة الافتراضية أو فتح حلقة جديدة.`;
  }
  if (info.near_capacity) {
    return `تبقى ${info.seats_remaining} مقاعد فقط (${info.student_count}/${info.default_capacity}). فكّر برفع السعة الافتراضية أو حلقة جديدة.`;
  }
  return null;
}
