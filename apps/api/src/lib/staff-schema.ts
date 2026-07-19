import { z } from "zod";
import { mobileForStorage } from "./mobile";
import { parsePositiveIntField } from "./students-schema";

const saudiMobileSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(
    z
      .string()
      .min(1, { message: "mobile_required" })
      .refine((s) => mobileForStorage(s) !== null, { message: "invalid_mobile" })
      .transform((s) => mobileForStorage(s)!),
  );

const optionalLinkId = z.preprocess(
  (v) => parsePositiveIntField(v),
  z.number().int().positive().nullable().optional(),
);

/** إنشاء معلم / مشرف مسار — بيانات شخصية ودور فقط (الإسناد من تبويب الحلقات/المسارات) */
export const staffTeacherCreateSchema = z.object({
  full_name_ar: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((s) => s.length > 0, { message: "name_required" }),
  mobile: saudiMobileSchema,
  role: z.enum(["teacher", "track_supervisor"]).optional().default("teacher"),
});

/** إنشاء حلقة — المعلم إلزامي */
export const circleCreateSchema = z.object({
  name_ar: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((s) => s.length > 0, { message: "name_required" }),
  stage_id: z.coerce.number().int().min(1).max(4),
  default_capacity: z.coerce.number().int().min(1),
  teacher_user_id: optionalLinkId,
  new_teacher: z
    .object({
      full_name_ar: z.string().trim().min(1),
      mobile: saudiMobileSchema,
    })
    .optional(),
  track_id: optionalLinkId,
});

const newStaffInlineSchema = z.object({
  full_name_ar: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((s) => s.length > 0, { message: "name_required" }),
  mobile: saudiMobileSchema,
});

/** إنشاء مسار — مشرف موجود أو مشرف جديد inline */
export const trackCreateSchema = z
  .object({
    name_ar: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .refine((s) => s.length > 0, { message: "name_required" }),
    default_capacity: z.coerce.number().int().min(1).default(20),
    supervisor_id: optionalLinkId,
    new_supervisor: newStaffInlineSchema.optional(),
    stage_ids: z.array(z.coerce.number().int().min(1).max(4)).optional(),
    circle_ids: z.array(z.coerce.number().int().positive()).optional(),
  })
  .refine(
    (data) => {
      const hasId =
        data.supervisor_id != null && Number(data.supervisor_id) > 0;
      const hasNew =
        Boolean(data.new_supervisor?.full_name_ar) &&
        Boolean(data.new_supervisor?.mobile);
      return hasId || hasNew;
    },
    { message: "supervisor_required" },
  );

export type StaffTeacherCreateInput = z.infer<typeof staffTeacherCreateSchema>;
export type CircleCreateInput = z.infer<typeof circleCreateSchema>;
export type TrackCreateInput = z.infer<typeof trackCreateSchema>;
