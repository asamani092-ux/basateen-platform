import { z } from "zod";
import { resolveMemorizationFields } from "./quran-memorization";

/** يحوّل "" و null و undefined إلى null للحقول الاختيارية */
export const optionalText = z.preprocess(
  (v) => {
    if (v == null || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v)) {
      const digits = String(Math.trunc(v));
      return digits.length > 0 ? digits : null;
    }
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, "");
    return s;
  },
  z.string().nullable(),
);

export const requiredText = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((s) => s.length > 0, { message: "required" });

export function parsePositiveIntField(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.trunc(v);
    return n > 0 ? n : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+\.0+$/.test(s)) {
    const n = Math.trunc(Number(s));
    return n > 0 ? n : null;
  }
  const n = Math.trunc(Number(s));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** O(1) — optional age 4–25; empty/invalid → null */
export function parseOptionalAge(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return null;
  if (n < 4 || n > 25) return null;
  return n;
}

export const optionalAge = z.preprocess(
  (v) => parseOptionalAge(v),
  z.number().int().min(4).max(25).nullable().optional(),
);

const OPTIONAL_STRING_KEYS = [
  "school_name",
  "school_grade",
  "memorization_amount",
  "guardian_national_id",
  "guardian_work",
  "health_notes",
] as const;

/** تهيئة الجسم الخام قبل Zod — توحيد المسميات وتحويل الأرقام */
export function normalizeIncomingStudentPayload(
  raw: unknown,
): Record<string, unknown> {
  if (raw == null || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const b: Record<string, unknown> = { ...src };

  if (b.fullName != null && b.full_name_ar == null) {
    b.full_name_ar = b.fullName;
  }
  if (b.nationalId != null && b.national_id == null) {
    b.national_id = b.nationalId;
  }
  if (b.guardianPhone != null && b.guardian_phone == null) {
    b.guardian_phone = b.guardianPhone;
  }

  for (const key of OPTIONAL_STRING_KEYS) {
    if (b[key] === "") b[key] = null;
  }

  for (const key of [
    "circle_id",
    "track_id",
    "group_id",
    "stage_id",
  ] as const) {
    if (b[key] === "" || b[key] == null) continue;
    const n = parsePositiveIntField(b[key]);
    b[key] = n ?? b[key];
  }

  if (b.group_type === "") delete b.group_type;

  if (b.age === "") b.age = null;

  return b;
}

const placementFields = z.object({
  circle_id: z.unknown().optional().nullable(),
  track_id: z.unknown().optional().nullable(),
  group_id: z.unknown().optional().nullable(),
  group_type: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["circle", "track"]).optional(),
  ),
  placement: z.preprocess(
    (v) => (v === "" || v == null ? undefined : String(v)),
    z.string().optional(),
  ),
});

const studentCreateBaseSchema = z
  .object({
    full_name_ar: requiredText,
    national_id: requiredText,
    nationality: z.preprocess(
      (v) => {
        if (v == null || v === "") return "سعودي";
        return String(v).trim() || "سعودي";
      },
      z.string().min(1),
    ),
    phone: requiredText,
    guardian_phone: requiredText,
    school_name: optionalText.optional(),
    school_grade: optionalText.optional(),
    memorization_amount: optionalText.optional(),
    memorization_faces: z.unknown().optional().nullable(),
    memorization_value: z.unknown().optional().nullable(),
    memorization_unit: z.unknown().optional().nullable(),
    guardian_national_id: optionalText.optional(),
    guardian_work: optionalText.optional(),
    health_notes: optionalText.optional(),
    stage_id: z.unknown().optional().nullable(),
    age: optionalAge,
  })
  .merge(placementFields);

function transformStudentBody(body: z.infer<typeof studentCreateBaseSchema>) {
  let circle_id = parsePositiveIntField(body.circle_id);
  let track_id = parsePositiveIntField(body.track_id);

  const groupId = parsePositiveIntField(body.group_id);
  if (groupId && body.group_type === "circle") {
    circle_id = groupId;
  } else if (groupId && body.group_type === "track") {
    track_id = groupId;
  }

  const placementKey = (body.placement ?? "").trim();
  if (placementKey.includes(":")) {
    const [kind, idStr] = placementKey.split(":");
    const id = parsePositiveIntField(idStr);
    if (id && kind === "circle") {
      circle_id = id;
    } else if (id && kind === "track") {
      track_id = id;
    }
  }

  const stage_id = parsePositiveIntField(body.stage_id);
  const age = parseOptionalAge(body.age);

  const memorization = resolveMemorizationFields({
    memorization_faces: body.memorization_faces,
    memorization_value: body.memorization_value,
    memorization_unit: body.memorization_unit,
    memorization_amount: body.memorization_amount,
  });

  return {
    full_name_ar: body.full_name_ar,
    national_id: body.national_id,
    nationality: body.nationality,
    phone: body.phone,
    guardian_phone: body.guardian_phone,
    school_name: body.school_name ?? null,
    school_grade: body.school_grade ?? null,
    memorization_amount: memorization.text,
    memorization_faces: memorization.faces,
    guardian_national_id: body.guardian_national_id ?? null,
    guardian_work: body.guardian_work ?? null,
    health_notes: body.health_notes ?? null,
    stage_id,
    age,
    circle_id,
    track_id,
  };
}

export const studentCreateBodySchema = z.preprocess(
  (raw) => normalizeIncomingStudentPayload(raw),
  studentCreateBaseSchema.transform(transformStudentBody),
).superRefine((data, ctx) => {
  if (data.circle_id == null && data.track_id == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "placement_required",
      path: ["circle_id"],
    });
  }
});

/** PATCH — لا يشترط الإسناد؛ العمر اختياري بالكامل */
export const studentPatchBodySchema = z.preprocess(
  (raw) => normalizeIncomingStudentPayload(raw),
  studentCreateBaseSchema.transform(transformStudentBody),
);

export const studentBulkRowSchema = z.object({
  full_name_ar: requiredText,
  national_id: requiredText,
  nationality: optionalText.optional(),
  phone: requiredText,
  guardian_phone: requiredText,
  school_name: optionalText.optional(),
  school_grade: optionalText.optional(),
  memorization_amount: optionalText.optional(),
  guardian_national_id: optionalText.optional(),
  health_notes: optionalText.optional(),
  group_name: optionalText.optional(),
  circle_name: optionalText.optional(),
  track_name: optionalText.optional(),
});

export const studentBulkBodySchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1).max(300),
});

export type StudentCreateBody = z.infer<typeof studentCreateBodySchema>;

export type StudentBulkRowInput = z.infer<typeof studentBulkRowSchema>;
