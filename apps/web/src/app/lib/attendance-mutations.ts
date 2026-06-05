import { toast } from "sonner";
import { api } from "./api-client";
export type BeneficiaryType = "student" | "staff";
export type AttendanceStatusValue = "present" | "absent" | "excused";

export async function mutateAttendanceStatus(opts: {
  beneficiaryType: BeneficiaryType;
  personId: number;
  attendanceId: number | null;
  hasRecord: boolean;
  date: string;
  status: AttendanceStatusValue;
  circleId?: number;
  trackId?: number;
}): Promise<{ attendanceId: number | null; hasRecord: boolean }> {
  if (opts.attendanceId != null && opts.hasRecord) {
    await api.adminPatchAttendance(opts.attendanceId, {
      beneficiary_type: opts.beneficiaryType,
      status: opts.status,
    });
    return { attendanceId: opts.attendanceId, hasRecord: true };
  }

  const res = await api.adminUpsertAttendance({
    beneficiary_type: opts.beneficiaryType,
    person_id: opts.personId,
    attendance_date: opts.date,
    status: opts.status,
    circle_id: opts.circleId,
    track_id: opts.trackId,
  });
  return { attendanceId: res.attendance_id, hasRecord: true };
}

export async function removeAttendanceRecord(opts: {
  beneficiaryType: BeneficiaryType;
  attendanceId: number;
}): Promise<void> {
  await api.adminDeleteAttendance(opts.attendanceId, opts.beneficiaryType);
}

export async function clearAttendanceDay(opts: {
  beneficiaryType: BeneficiaryType;
  date: string;
  circleId?: number;
  trackId?: number;
}): Promise<number> {
  const res = await api.adminBulkDeleteAttendance({
    beneficiary_type: opts.beneficiaryType,
    attendance_date: opts.date,
    circle_id: opts.circleId,
    track_id: opts.trackId,
  });
  return res.deleted;
}

export function toastAttendanceSaved(): void {
  toast.success("تم تحديث التحضير");
}

export function toastAttendanceDeleted(): void {
  toast.success("تم حذف سجل التحضير");
}

export function toastAttendanceCleared(count: number): void {
  toast.success(`تم إلغاء تحضير اليوم (${count} سجل)`);
}
