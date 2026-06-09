/** مسودة رصد المقرئ — تخزين مؤقت لكل منافسة/طالب */

export type ReciterDraftAudit = {
  juz_done?: number;
  hizb_done?: number;
  alerts_count?: number;
  errors_count?: number;
  task_points?: Record<number, number>;
  notes?: string;
};

export function reciterDraftKey(
  sessionId: number,
  studentId: number,
  token: string,
): string {
  return `basateen-competition-draft-${sessionId}-${studentId}-${token.slice(0, 8)}`;
}

export function readReciterDraft(
  sessionId: number,
  studentId: number,
  token: string,
): ReciterDraftAudit | null {
  try {
    const raw = localStorage.getItem(reciterDraftKey(sessionId, studentId, token));
    if (!raw) return null;
    return JSON.parse(raw) as ReciterDraftAudit;
  } catch {
    return null;
  }
}

export function writeReciterDraft(
  sessionId: number,
  studentId: number,
  token: string,
  draft: ReciterDraftAudit,
): void {
  try {
    localStorage.setItem(
      reciterDraftKey(sessionId, studentId, token),
      JSON.stringify(draft),
    );
  } catch {
    /* quota */
  }
}

export function clearReciterDraft(
  sessionId: number,
  studentId: number,
  token: string,
): void {
  localStorage.removeItem(reciterDraftKey(sessionId, studentId, token));
}
