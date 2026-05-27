import type { Env } from "../types";
import { mergeLedgerNotes, parseLedgerNotes, upsertQuranLedgerRow } from "./quran-ledger";

export type HimmaAuditView = {
  student_id: number;
  attendance: string | null;
  juz_done: number;
  hizb_done: number;
  alerts_count: number;
  errors_count: number;
  current_hizb_failed: number;
  updated_at: string;
};

export async function fetchHimmaAuditFromLedger(
  env: Env,
  sessionId: number,
  sessionDate: string,
): Promise<HimmaAuditView[]> {
  const rows = await env.DB.prepare(
    `SELECT student_id, has_memorized, memorization_errors, memorization_warnings,
            notes, updated_at
     FROM quran_daily_ledger
     WHERE context_type = 'yom_himma' AND context_id = ? AND mark_date = ?`,
  )
    .bind(sessionId, sessionDate)
    .all<{
      student_id: number;
      has_memorized: number;
      memorization_errors: number;
      memorization_warnings: number;
      notes: string | null;
      updated_at: string;
    }>();

  return (rows.results ?? []).map((r) => {
    const meta = parseLedgerNotes(r.notes);
    return {
      student_id: r.student_id,
      attendance:
        meta.attendance ?? (r.has_memorized === 1 ? "present" : null),
      juz_done: meta.juz_done ?? 0,
      hizb_done: meta.hizb_done ?? 0,
      alerts_count: r.memorization_warnings,
      errors_count: r.memorization_errors,
      current_hizb_failed: meta.current_hizb_failed ?? 0,
      updated_at: r.updated_at,
    };
  });
}

export async function upsertHimmaAuditToLedger(
  env: Env,
  opts: {
    sessionId: number;
    sessionDate: string;
    studentId: number;
    loggedByUserId: number;
    attendance?: string | null;
    juz_done?: number;
    hizb_done?: number;
    alerts_count?: number;
    errors_count?: number;
    current_hizb_failed?: number;
    delta_alert?: number;
    delta_error?: number;
    delta_juz?: number;
    delta_hizb?: number;
    rules: { alerts_per_error: number; fail_threshold_errors: number };
  },
): Promise<{ failed: boolean; effective_errors: number }> {
  const existing = await env.DB.prepare(
    `SELECT memorization_errors, memorization_warnings, has_memorized, notes
     FROM quran_daily_ledger
     WHERE student_id = ? AND mark_date = ? AND context_type = 'yom_himma' AND context_id = ?`,
  )
    .bind(opts.studentId, opts.sessionDate, opts.sessionId)
    .first<{
      memorization_errors: number;
      memorization_warnings: number;
      has_memorized: number;
      notes: string | null;
    }>();

  const meta = parseLedgerNotes(existing?.notes ?? null);
  let alerts = existing?.memorization_warnings ?? 0;
  let errors = existing?.memorization_errors ?? 0;
  let juz = meta.juz_done ?? 0;
  let hizb = meta.hizb_done ?? 0;
  let failed = meta.current_hizb_failed ?? 0;
  let attendance = meta.attendance ?? "present";

  if (opts.attendance) attendance = opts.attendance;
  if (opts.alerts_count != null) alerts = opts.alerts_count;
  if (opts.errors_count != null) errors = opts.errors_count;
  if (opts.delta_alert) alerts += opts.delta_alert;
  if (opts.delta_error) errors += opts.delta_error;
  if (opts.delta_juz) juz += opts.delta_juz;
  if (opts.delta_hizb) hizb += opts.delta_hizb;
  if (opts.juz_done != null) juz = opts.juz_done;
  if (opts.hizb_done != null) hizb = opts.hizb_done;

  const effectiveErrors =
    errors + Math.floor(alerts / Math.max(opts.rules.alerts_per_error, 1));
  if (effectiveErrors >= opts.rules.fail_threshold_errors) failed = 1;
  if (opts.current_hizb_failed != null) failed = opts.current_hizb_failed;

  const notes = mergeLedgerNotes(existing?.notes ?? null, {
    juz_done: juz,
    hizb_done: hizb,
    current_hizb_failed: failed,
    attendance,
  });

  await upsertQuranLedgerRow(env, {
    studentId: opts.studentId,
    markDate: opts.sessionDate,
    contextType: "yom_himma",
    contextId: opts.sessionId,
    loggedByUserId: opts.loggedByUserId,
    hasMemorized:
      attendance === "present" || juz > 0 || hizb > 0 ? 1 : 0,
    memorizationErrors: errors,
    memorizationWarnings: alerts,
    notes,
  });

  return { failed: failed === 1, effective_errors: effectiveErrors };
}
