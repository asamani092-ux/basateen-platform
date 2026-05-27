import type { Env } from "../types";
import { recordTeacherAutoAttendance } from "./teacher-attendance";

export type LedgerContextType =
  | "circle"
  | "track"
  | "competition"
  | "yom_himma";

export type LedgerUpsertInput = {
  studentId: number;
  markDate: string;
  contextType: LedgerContextType;
  contextId: number;
  loggedByUserId: number;
  hasMemorized?: number;
  hasRepeated?: number;
  hasReviewed?: number;
  hasLinked?: number;
  memorizationErrors?: number;
  memorizationWarnings?: number;
  reviewErrors?: number;
  notes?: string | null;
};

export async function upsertQuranLedgerRow(
  env: Env,
  input: LedgerUpsertInput,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO quran_daily_ledger (
       student_id, mark_date, context_type, context_id, logged_by_user_id,
       has_memorized, has_repeated, has_reviewed, has_linked,
       memorization_errors, memorization_warnings, review_errors, notes,
       recorded_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(student_id, mark_date, context_type, context_id) DO UPDATE SET
       logged_by_user_id = excluded.logged_by_user_id,
       has_memorized = excluded.has_memorized,
       has_repeated = excluded.has_repeated,
       has_reviewed = excluded.has_reviewed,
       has_linked = excluded.has_linked,
       memorization_errors = excluded.memorization_errors,
       memorization_warnings = excluded.memorization_warnings,
       review_errors = excluded.review_errors,
       notes = COALESCE(excluded.notes, quran_daily_ledger.notes),
       updated_at = datetime('now')`,
  )
    .bind(
      input.studentId,
      input.markDate,
      input.contextType,
      input.contextId,
      input.loggedByUserId,
      input.hasMemorized ?? 0,
      input.hasRepeated ?? 0,
      input.hasReviewed ?? 0,
      input.hasLinked ?? 0,
      input.memorizationErrors ?? 0,
      input.memorizationWarnings ?? 0,
      input.reviewErrors ?? 0,
      input.notes ?? null,
    )
    .run();
}

export async function applyReciterAttendance(
  env: Env,
  complexId: number,
  studentId: number,
  markDate: string,
  hasMemorized: number,
  loggedByUserId: number,
): Promise<void> {
  if (hasMemorized !== 1) return;
  await recordTeacherAutoAttendance(
    env,
    complexId,
    studentId,
    markDate,
    loggedByUserId,
  );
}

export type LedgerNotesMeta = {
  juz_done?: number;
  hizb_done?: number;
  current_hizb_failed?: number;
  attendance?: string;
};

export function parseLedgerNotes(notes: string | null): LedgerNotesMeta {
  if (!notes?.trim()) return {};
  try {
    return JSON.parse(notes) as LedgerNotesMeta;
  } catch {
    return {};
  }
}

export function mergeLedgerNotes(
  existing: string | null,
  patch: LedgerNotesMeta,
): string {
  return JSON.stringify({ ...parseLedgerNotes(existing), ...patch });
}
