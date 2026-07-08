import type { AttendanceEntityOption } from "./AttendanceEntityCombobox";

export type AttendanceEntityMeta = {
  student_count: number;
  has_record: boolean;
};

export function attendanceEntityKey(entity: {
  type: "circle" | "track";
  id: number;
}): string {
  return `${entity.type}:${entity.id}`;
}

export function buildAttendanceEntityMetaMap(
  circles: Array<{ id: number; student_count?: number; has_record?: boolean }>,
  tracks: Array<{ id: number; student_count?: number; has_record?: boolean }>,
): Map<string, AttendanceEntityMeta> {
  const map = new Map<string, AttendanceEntityMeta>();
  for (const c of circles) {
    map.set(`circle:${c.id}`, {
      student_count: Number(c.student_count ?? 0),
      has_record: Boolean(c.has_record),
    });
  }
  for (const t of tracks) {
    map.set(`track:${t.id}`, {
      student_count: Number(t.student_count ?? 0),
      has_record: Boolean(t.has_record),
    });
  }
  return map;
}

export function metaForEntity(
  map: Map<string, AttendanceEntityMeta>,
  entity: AttendanceEntityOption,
): AttendanceEntityMeta | undefined {
  return map.get(attendanceEntityKey(entity));
}
