import { z } from "zod";

/** يحوّل "" و null و undefined إلى null للحقول الاختيارية */
export const optionalText = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, "");
    return s;
  });

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

const placementFields = z.object({
  circle_id: z.unknown().optional(),
  track_id: z.unknown().optional(),
  group_id: z.unknown().optional(),
  group_type: z.enum(["circle", "track"]).optional(),
  placement: z.string().optional(),
});

export const studentCreateBodySchema = z
  .object({
    full_name_ar: requiredText,
    national_id: requiredText,
    nationality: z
      .union([z.string(), z.number(), z.null(), z.undefined()])
      .transform((v) => {
        const s = v == null ? "" : String(v).trim();
        return s.length > 0 ? s : "سعودي";
      }),
    phone: requiredText,
    guardian_phone: requiredText,
    school_name: optionalText.optional(),
    school_grade: optionalText.optional(),
    memorization_amount: optionalText.optional(),
    guardian_national_id: optionalText.optional(),
    guardian_work: optionalText.optional(),
    health_notes: optionalText.optional(),
    stage_id: z.unknown().optional(),
    age: z.unknown().optional(),
  })
  .merge(placementFields)
  .transform((body) => {
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
        track_id = null;
      } else if (id && kind === "track") {
        track_id = id;
        circle_id = null;
      }
    }

    const stage_id = parsePositiveIntField(body.stage_id);
    let age: number | null = null;
    if (body.age != null && body.age !== "") {
      const n = Math.trunc(Number(body.age));
      if (Number.isFinite(n) && n >= 4 && n <= 25) age = n;
    }

    return {
      full_name_ar: body.full_name_ar,
      national_id: body.national_id,
      nationality: body.nationality,
      phone: body.phone,
      guardian_phone: body.guardian_phone,
      school_name: body.school_name ?? null,
      school_grade: body.school_grade ?? null,
      memorization_amount: body.memorization_amount ?? null,
      guardian_national_id: body.guardian_national_id ?? null,
      guardian_work: body.guardian_work ?? null,
      health_notes: body.health_notes ?? null,
      stage_id,
      age,
      circle_id,
      track_id,
    };
  })
  .refine((d) => d.circle_id != null || d.track_id != null, {
    message: "placement_required",
  });

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
