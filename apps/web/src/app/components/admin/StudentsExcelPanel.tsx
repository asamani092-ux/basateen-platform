import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";
import {
  downloadTemplate,
  exportStudentsToExcel,
  parseStudentExcel,
  type StudentExcelRow,
} from "../../lib/student-excel";

type ImportMode = "register" | "transfer";

export function StudentsExcelPanel() {
  const [mode, setMode] = useState<ImportMode>("register");
  const [preview, setPreview] = useState<StudentExcelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success: number;
    failed: number;
    total: number;
  } | null>(null);

  const hasApi = Boolean(getApiToken());

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const rows = parseStudentExcel(await file.arrayBuffer());
      if (rows.length === 0) {
        setError("الملف لا يحتوي بيانات. تأكد من تعبئة الصفوف تحت العناوين.");
        setPreview([]);
        return;
      }
      setPreview(rows);
    } catch (err) {
      setPreview([]);
      setError(err instanceof Error ? err.message : "تعذّر قراءة الملف");
    }
  }

  async function applyToSystem() {
    if (preview.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.studentsBulkImport(mode, preview);
      setResult({
        success: res.success,
        failed: res.failed,
        total: res.total,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر التطبيق");
    } finally {
      setLoading(false);
    }
  }

  async function exportCurrentList() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.studentsExport();
      exportStudentsToExcel(
        res.items.map((s) => ({
          full_name_ar: s.full_name_ar,
          national_id: s.national_id,
          nationality: s.nationality,
          phone: s.phone,
          school_name: s.school_name,
          school_grade: s.school_grade,
          memorization_amount: s.memorization_amount,
          guardian_phone: s.guardian_phone,
          guardian_national_id: s.guardian_national_id,
          circle_name: s.circle_name,
          health_notes: s.health_notes,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر التصدير");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {!hasApi && (
        <div className={ds.alert.info} style={tajawal}>
          سجّل الخروج ثم ادخل بالجوال (0500000001 أو 0500000002) لربط النظام.
        </div>
      )}

      {error && (
        <div className={ds.alert.error} style={tajawal}>
          {error}
        </div>
      )}

      {result && (
        <div className={ds.alert.success} style={tajawal}>
          تم تطبيق {result.total} صفاً — نجح {result.success} — فشل {result.failed}
        </div>
      )}

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className={ds.page.section} style={tajawal}>
            <FileSpreadsheet className="inline w-5 h-5 ml-2 text-primary" />
            العمل عبر ملف Excel
          </CardTitle>
          <CardDescription style={tajawal}>
            اتبع الخطوات بالترتيب. كل زر موضّح بما يفعله بالضبط.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ol className="space-y-4 list-none" style={tajawal}>
            <li className="flex flex-wrap items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                ١
              </span>
              <div className="flex-1 min-w-[200px]">
                <p className="font-semibold text-foreground">تحميل نموذج فارغ</p>
                <p className="text-xs text-muted-foreground">
                  ملف Excel بعناوين الأعمدة الصحيحة فقط — للتعبئة على جهازك
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className={ds.btnRound}
                onClick={downloadTemplate}
                style={tajawal}
              >
                <Download className="w-4 h-4" />
                تحميل النموذج
              </Button>
            </li>

            <li className="flex flex-wrap items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                ٢
              </span>
              <div className="flex-1">
                <p className="font-semibold text-foreground">تعبئة البيانات</p>
                <p className="text-xs text-muted-foreground">
                  افتح الملف في Excel وأدخل بيانات الطلاب (اسم، هوية، جوال، حلقة، …)
                </p>
              </div>
            </li>

            <li className="flex flex-wrap items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-muted text-foreground flex items-center justify-center text-sm font-bold shrink-0">
                ٣
              </span>
              <div className="flex-1 min-w-[200px]">
                <p className="font-semibold text-foreground">
                  تصدير القائمة الحالية (اختياري)
                </p>
                <p className="text-xs text-muted-foreground">
                  نسخة احتياطية من طلاب النظام الآن — قبل أي تعديل جماعي
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className={ds.btnRound}
                onClick={exportCurrentList}
                disabled={loading || !hasApi}
                style={tajawal}
              >
                <Download className="w-4 h-4" />
                تصدير القائمة الحالية
              </Button>
            </li>

            <li className="space-y-3">
              <div className="flex flex-wrap items-start gap-3">
                <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                  ٤
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">
                    رفع الملف بعد التعبئة
                  </p>
                  <p className="text-xs text-muted-foreground">
                    اختر ملف .xlsx الذي ملأته — للمعاينة قبل التطبيق
                  </p>
                </div>
              </div>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl p-6 cursor-pointer hover:bg-muted/50 mx-0 sm:mx-11">
                <Upload className="w-8 h-8 text-primary mb-2" />
                <span className="text-sm text-muted-foreground" style={tajawal}>
                  اضغط لاختيار ملف Excel
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={onFile}
                />
              </label>
              {preview.length > 0 && (
                <p className="text-sm text-muted-foreground sm:mx-11" style={tajawal}>
                  جاهز للمعاينة: {preview.length} طالب
                </p>
              )}
            </li>

            <li className="space-y-3">
              <div className="flex flex-wrap items-start gap-3">
                <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                  ٥
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">نوع العملية ثم التطبيق</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    <strong>تسجيل:</strong> إضافة طلاب جدد أو تحديث بياناتهم.
                    <strong className="mr-2">نقل:</strong> تغيير حلقة طلاب موجودين فقط.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "register" ? "default" : "outline"}
                      className={ds.btnRound}
                      onClick={() => setMode("register")}
                      style={tajawal}
                    >
                      تسجيل / تحديث بيانات
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "transfer" ? "default" : "outline"}
                      className={ds.btnRound}
                      onClick={() => setMode("transfer")}
                      style={tajawal}
                    >
                      نقل إلى حلقة أخرى
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                className={`w-full sm:w-auto sm:mx-11 ${ds.btnRound}`}
                onClick={applyToSystem}
                disabled={loading || !hasApi || preview.length === 0}
                style={tajawal}
              >
                {loading ? "جاري التطبيق..." : "تطبيق البيانات على النظام"}
              </Button>
            </li>
          </ol>
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle className={ds.page.section} style={tajawal}>
              معاينة قبل التطبيق
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={tajawal}>الاسم</TableHead>
                  <TableHead style={tajawal}>الهوية</TableHead>
                  <TableHead style={tajawal}>الجوال</TableHead>
                  <TableHead style={tajawal}>الحلقة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 10).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell style={tajawal}>{r.full_name_ar}</TableCell>
                    <TableCell style={tajawal}>{r.national_id ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{r.phone ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{r.circle_name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
