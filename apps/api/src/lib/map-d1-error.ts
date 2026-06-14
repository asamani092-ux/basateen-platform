export type D1MappedError = {
  status: number;
  error: string;
  message: string;
};

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

/** O(1) — map D1/SQLite constraint errors to Arabic client messages. */
export function mapD1ErrorToResponse(error: unknown): D1MappedError | null {
  const msg = errorText(error);
  const upper = msg.toUpperCase();

  if (upper.includes("UNIQUE")) {
    if (msg.includes("national_id")) {
      return {
        status: 409,
        error: "duplicate_national_id",
        message: "رقم الهوية مسجل مسبقاً في النظام",
      };
    }
    if (msg.includes("mobile") || msg.includes("phone")) {
      return {
        status: 409,
        error: "duplicate_mobile",
        message: "رقم الجوال مسجل مسبقاً في النظام",
      };
    }
    if (msg.includes("email")) {
      return {
        status: 409,
        error: "duplicate_email",
        message: "البريد الإلكتروني مسجل مسبقاً في النظام",
      };
    }
    return {
      status: 409,
      error: "duplicate_user",
      message: "هذا المستخدم مسجل مسبقاً في النظام",
    };
  }

  if (upper.includes("FOREIGN KEY")) {
    return {
      status: 400,
      error: "foreign_key_violation",
      message: "البيانات المرتبطة غير صالحة أو غير موجودة",
    };
  }

  if (upper.includes("NOT NULL")) {
    return {
      status: 400,
      error: "missing_required_field",
      message: "حقل مطلوب ناقص في البيانات المرسلة",
    };
  }

  if (upper.includes("CHECK CONSTRAINT")) {
    return {
      status: 400,
      error: "invalid_value",
      message: "قيمة غير مسموحة في أحد الحقول",
    };
  }

  return null;
}

export function d1ErrorJson(error: unknown, fallbackStatus = 500): Response | null {
  const mapped = mapD1ErrorToResponse(error);
  if (!mapped) return null;
  return Response.json(
    { error: mapped.error, message: mapped.message },
    { status: mapped.status },
  );
}
