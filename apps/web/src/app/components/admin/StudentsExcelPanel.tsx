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

/** O(n) — n = عدد الأسطر */
export function parseBulkPasteText(text: string): StudentImportRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      const [full_name_ar, guardian_phone, track_name, circle_name] = parts;
      return {
        full_name_ar: full_name_ar ?? "",
        guardian_phone: guardian_phone || null,
        phone: guardian_phone || null,
        track_name: track_name || null,
        circle_name: circle_name || null,
        nationality: "سعودي",
      };
    });
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
      setError(err instanceof Error ? err.message : "تعذّر الحفظ");
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
            الصق قائمة الطلاب دفعة واحدة — بدون ملف Excel. الترتيب إلزامي في كل سطر.
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
