import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";

export type TransferEventStatus = "success" | "failed";
export type TransferEventSource = "teacher_request" | "manual" | "direct";

type LogTransferInput = {
  complexId: number;
  studentId: number;
  studentName?: string | null;
  status: TransferEventStatus;
  source: TransferEventSource;
  teacherRequestId?: number | null;
  oldCircleId?: number | null;
  newCircleId?: number | null;
  oldTrackId?: number | null;
  newTrackId?: number | null;
  oldCircleName?: string | null;
  newCircleName?: string | null;
  newTrackName?: string | null;
  reason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  initiatedByUserId?: number | null;
  resolvedByUserId?: number | null;
};

type NotifyInput = {
  complexId: number;
  recipientUserId: number;
  titleAr: string;
  bodyAr: string;
  referenceId?: number | null;
};

export async function logTransferEvent(
  env: Env,
  input: LogTransferInput,
): Promise<number | null> {
  if (!(await hasTable(env, "edu_transfer_events"))) return null;
  const res = await env.DB.prepare(
    `INSERT INTO edu_transfer_events (
       complex_id, student_id, student_name, status, source, teacher_request_id,
       old_circle_id, new_circle_id, old_track_id, new_track_id,
       old_circle_name, new_circle_name, new_track_name,
       reason, error_code, error_message,
       initiated_by_user_id, resolved_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.complexId,
      input.studentId,
      input.studentName ?? null,
      input.status,
      input.source,
      input.teacherRequestId ?? null,
      input.oldCircleId ?? null,
      input.newCircleId ?? null,
      input.oldTrackId ?? null,
      input.newTrackId ?? null,
      input.oldCircleName ?? null,
      input.newCircleName ?? null,
      input.newTrackName ?? null,
      input.reason ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.initiatedByUserId ?? null,
      input.resolvedByUserId ?? null,
    )
    .run();
  return Number(res.meta.last_row_id) || null;
}

export async function createEduNotification(
  env: Env,
  input: NotifyInput,
): Promise<number | null> {
  if (!(await hasTable(env, "edu_notifications"))) return null;
  const res = await env.DB.prepare(
    `INSERT INTO edu_notifications (
       complex_id, recipient_user_id, type, title_ar, body_ar, reference_id
     ) VALUES (?, ?, 'transfer', ?, ?, ?)`,
  )
    .bind(
      input.complexId,
      input.recipientUserId,
      input.titleAr,
      input.bodyAr,
      input.referenceId ?? null,
    )
    .run();
  return Number(res.meta.last_row_id) || null;
}

/** O(1)–O(2) — أسماء الحلقة/المسار من المعرّفات */
export async function resolvePlacementLabels(
  env: Env,
  circleId: number | null | undefined,
  trackId: number | null | undefined,
): Promise<{ circle_name: string | null; track_name: string | null }> {
  let circle_name: string | null = null;
  let track_name: string | null = null;
  if (circleId != null && circleId > 0) {
    const row = await env.DB.prepare(`SELECT name_ar FROM circles WHERE id = ?`)
      .bind(circleId)
      .first<{ name_ar: string }>();
    circle_name = row?.name_ar ?? null;
  }
  if (trackId != null && trackId > 0) {
    const row = await env.DB.prepare(`SELECT name_ar FROM tracks WHERE id = ?`)
      .bind(trackId)
      .first<{ name_ar: string }>();
    track_name = row?.name_ar ?? null;
  }
  return { circle_name, track_name };
}

export async function circleTeacherUserId(
  env: Env,
  circleId: number | null | undefined,
): Promise<number | null> {
  if (!circleId) return null;
  const row = await env.DB.prepare(
    `SELECT teacher_id FROM circles WHERE id = ? AND teacher_id IS NOT NULL`,
  )
    .bind(circleId)
    .first<{ teacher_id: number }>();
  return row?.teacher_id ?? null;
}

export async function trackSupervisorUserId(
  env: Env,
  trackId: number | null | undefined,
): Promise<number | null> {
  if (!trackId || trackId <= 0) return null;
  if (!(await tableHasColumn(env, "tracks", "supervisor_id"))) return null;
  const row = await env.DB.prepare(
    `SELECT supervisor_id FROM tracks WHERE id = ? AND supervisor_id IS NOT NULL`,
  )
    .bind(trackId)
    .first<{ supervisor_id: number }>();
  return row?.supervisor_id ?? null;
}

/** O(1) — teachers/supervisors affected by a placement change only */
export async function resolveTransferNotificationRecipientUserIds(
  env: Env,
  params: {
    oldCircleId?: number | null;
    newCircleId?: number | null;
    oldTrackId?: number | null;
    newTrackId?: number | null;
  },
): Promise<number[]> {
  const ids = new Set<number>();
  const oldTeacher = await circleTeacherUserId(env, params.oldCircleId);
  const newTeacher = await circleTeacherUserId(env, params.newCircleId);
  const oldSupervisor = await trackSupervisorUserId(env, params.oldTrackId);
  const newSupervisor = await trackSupervisorUserId(env, params.newTrackId);
  for (const uid of [oldTeacher, newTeacher, oldSupervisor, newSupervisor]) {
    if (uid != null && uid > 0) ids.add(uid);
  }
  return [...ids];
}

export async function notifyTransferRecipients(
  env: Env,
  params: {
    complexId: number;
    studentName: string;
    newCircleName: string;
    newTrackName?: string | null;
    recipientUserIds: number[];
    referenceId?: number | null;
  },
): Promise<void> {
  const dest =
    params.newTrackName && params.newCircleName !== params.newTrackName
      ? `${params.newCircleName} / ${params.newTrackName}`
      : params.newTrackName ?? params.newCircleName;
  const bodyAr = `تم نقل الطالب (${params.studentName}) بنجاح إلى (${dest})`;
  const unique = [...new Set(params.recipientUserIds.filter((id) => id > 0))];
  for (const uid of unique) {
    await createEduNotification(env, {
      complexId: params.complexId,
      recipientUserId: uid,
      titleAr: "إشعار نقل طالب",
      bodyAr,
      referenceId: params.referenceId,
    });
  }
}
