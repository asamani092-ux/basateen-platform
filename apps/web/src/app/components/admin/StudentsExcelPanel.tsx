import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { api, type StudentImportRow } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";

const PLACEHOLDER =
  "الصق البيانات هنا — كل طالب في سطر، والفاصل بين الحقول فاصلة (,)\n" +
  "الترتيب: اسم الطالب, رقم ولي الأمر, المسار, الحلقة\n" +
  "مثال:\n" +
  "محمد أحمد,0501234567,مسار حفظ,حلقة الفجر\n" +
  "سارة علي,0509876543,مسار تأسيس,حلقة النور";

function fieldOrNull(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

/** O(n) — n = عدد الأسطر */
export function parseBulkPasteText(text: string): StudentImportRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      while (parts.length < 4) parts.push("");
      const full_name_ar = parts[0] ?? "";
      const guardian_phone = fieldOrNull(parts[1]);
      const track_name = fieldOrNull(parts[2]);
      const circle_name = fieldOrNull(parts[3]);
      return {
        full_name_ar,
        guardian_phone,
        phone: guardian_phone,
        track_name,
        circle_name,
        nationality: "سعودي",
      };
    })
    .filter((row) => row.full_name_ar.trim().length > 0);
}

export function StudentsExcelPanel() {
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success: number;
    failed: number;
    total: number;
  } | null>(null);

  const hasApi = Boolean(getApiToken());
  const preview = useMemo(() => parseBulkPasteText(pasteText), [pasteText]);

  async function applyToSystem() {
    if (preview.length === 0) {
      setError("لا توجد أسطر صالحة للحفظ");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.studentsBulkImport("register", preview);
      setResult({
        success: res.success,
        failed: res.failed,
        total: res.total,
      });
      if (res.success > 0) {
        setPasteText("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذّر الحفظ";
      setError(
        msg.includes("students_bulk_import_failed")
          ? "فشل الاستيراد الجماعي — تأكد أن كل سطر يحتوي اسم الطالب على الأقل"
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {!hasApi && (
        <div className={ds.alert.info} style={tajawal}>
          سجّل الخروج ثم ادخل بالجوال لربط النظام.
        </div>
      )}

      {error && (
        <div className={ds.alert.error} style={tajawal}>
          {error}
        </div>
      )}

      {result && (
        <div className={ds.alert.success} style={tajawal}>
          تم معالجة {result.total} سطراً — نجح {result.success} — فشل {result.failed}
        </div>
      )}

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className={ds.page.section} style={tajawal}>
            الإضافة الجماعية (لصق نصي)
          </CardTitle>
          <CardDescription style={tajawal}>
            الصق قائمة الطلاب دفعة واحدة. الحقل الإلزامي هو الاسم فقط؛ باقي الحقول اختيارية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-semibold" style={tajawal}>
              بيانات الطلاب
            </span>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={12}
              dir="rtl"
              className={`w-full min-h-[220px] border border-border rounded-2xl p-4 text-sm bg-background ${ds.btnRound}`}
              style={tajawal}
            />
          </label>
          <p className="text-xs text-muted-foreground" style={tajawal}>
            الترتيب: <strong>اسم الطالب</strong>، <strong>رقم ولي الأمر</strong>،{" "}
            <strong>المسار</strong>، <strong>الحلقة</strong> — مفصولة بفاصلة إنجليزية
            (,)
            {preview.length > 0
              ? ` — جاهز للحفظ: ${preview.length} طالب`
              : ""}
          </p>
          <Button
            type="button"
            className={ds.btnRound}
            onClick={applyToSystem}
            disabled={loading || !hasApi || preview.length === 0}
            style={tajawal}
          >
            {loading ? "جاري الحفظ…" : "حفظ الطلاب"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
