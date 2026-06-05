import type { AttendanceStatusValue } from "./attendance-mutations";
import { normalizeAttendanceStatus } from "./attendance-status";

export type DateFilterMode = "day" | "range";

export type LedgerEntry = {
  rowKey: string;
  attendance_id: number | null;
  person_id: number;
  full_name_ar: string;
  attendance_date: string;
  status: AttendanceStatusValue;
  savedStatus: AttendanceStatusValue;
  has_record: boolean;
  role?: string | null;
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isRangeMode(mode: DateFilterMode, start: string, end: string): boolean {
  return mode === "range" || start !== end;
}

export function rosterRowKey(personId: number): string {
  return `roster-${personId}`;
}

export function ledgerRowKey(attendanceId: number): string {
  return `ledger-${attendanceId}`;
}

export function mapRosterItem(item: {
  student_id?: number;
  user_id?: number;
  full_name_ar: string;
  status?: string;
  attendance_id?: number | null;
  has_record?: boolean;
  role?: string | null;
}): LedgerEntry {
  const personId = Number(item.student_id ?? item.user_id);
  const status = normalizeAttendanceStatus(item.status ?? "present") as AttendanceStatusValue;
  const hasRecord = Boolean(item.has_record);
  const attendanceId = item.attendance_id ?? null;
  return {
    rowKey: hasRecord && attendanceId != null
      ? ledgerRowKey(attendanceId)
      : rosterRowKey(personId),
    attendance_id: attendanceId,
    person_id: personId,
    full_name_ar: item.full_name_ar,
    attendance_date: "",
    status,
    savedStatus: status,
    has_record: hasRecord,
    role: item.role ?? null,
  };
}

export function mapLedgerItem(item: {
  attendance_id: number;
  person_id: number;
  full_name_ar: string;
  attendance_date: string;
  status: string;
  role?: string | null;
}): LedgerEntry {
  const status = normalizeAttendanceStatus(item.status) as AttendanceStatusValue;
  return {
    rowKey: ledgerRowKey(item.attendance_id),
    attendance_id: item.attendance_id,
    person_id: item.person_id,
    full_name_ar: item.full_name_ar,
    attendance_date: item.attendance_date,
    status,
    savedStatus: status,
    has_record: true,
    role: item.role ?? null,
  };
}

export function isEntryDirty(entry: LedgerEntry): boolean {
  return entry.status !== entry.savedStatus;
}

export function countDirty(entries: LedgerEntry[]): number {
  return entries.filter(isEntryDirty).length;
}

export function patchEntryStatus(
  entries: LedgerEntry[],
  rowKey: string,
  status: AttendanceStatusValue,
): LedgerEntry[] {
  return entries.map((e) => (e.rowKey === rowKey ? { ...e, status } : e));
}

export function markEntriesSaved(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.map((e) => ({ ...e, savedStatus: e.status, has_record: true }));
}

export function removeEntry(entries: LedgerEntry[], rowKey: string): LedgerEntry[] {
  return entries.filter((e) => e.rowKey !== rowKey);
}

export function resetEntryAfterDelete(entries: LedgerEntry[], rowKey: string): LedgerEntry[] {
  return entries.map((e) =>
    e.rowKey === rowKey
      ? {
          ...e,
          status: "present",
          savedStatus: "present",
          attendance_id: null,
          has_record: false,
          rowKey: rosterRowKey(e.person_id),
        }
      : e,
  );
}

export type BulkSaveRecord = {
  attendance_id?: number;
  person_id?: number;
  attendance_date?: string;
  status: string;
  circle_id?: number;
  track_id?: number;
};

export function buildBulkSaveRecords(
  entries: LedgerEntry[],
  date: string,
  entity?: { circleId?: number; trackId?: number },
): BulkSaveRecord[] {
  return entries
    .filter(isEntryDirty)
    .map((e) => {
      if (e.attendance_id != null && e.has_record) {
        return { attendance_id: e.attendance_id, status: e.status };
      }
      return {
        person_id: e.person_id,
        attendance_date: e.attendance_date || date,
        status: e.status,
        circle_id: entity?.circleId,
        track_id: entity?.trackId,
      };
    });
}
