import { useState } from "react";
import { Link } from "react-router";
import { FileDown, FileUp, Upload } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import {
  downloadTemplate,
  exportStudentsToExcel,
  parseStudentExcel,
  type StudentExcelRow,
} from "../../lib/student-excel";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

type ImportMode = "register" | "transfer";

const ERROR_AR: Record<string, string> = {
  missing_name_column: "الملف يفتقد عمود «الاسم الرباعي»",
  unauthorized: "أعد تسجيل الدخول",
  too_many_rows: "الحد الأقصى 300 صف",
};

export function StudentsImportPage() {
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
      const buf = await file.arrayBuffer();
      const rows = parseStudentExcel(buf);
      if (rows.length === 0) {
        setError("لا توجد صفوف بيانات في الملف");
        setPreview([]);
        return;
      }
      setPreview(rows);
    } catch (err) {
      setPreview([]);
      setError(
        err instanceof Error
          ? ERROR_AR[err.message] ?? err.message
          : "فشل قراءة الملف",
      );
    }
  }

  async function runImport() {
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
      setError(err instanceof Error ? err.message : "فشل الاستيراد");
    } finally {
      setLoading(false);
    }
  }

  async function runExport() {
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
      setError(err instanceof Error ? err.message : "فشل التصدير");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            className="text-2xl font-bold text-slate-900 dark:text-white"
            style={tajawal}
          >
            استيراد / تصدير الطلاب (Excel)
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mt-1" style={tajawal}>
            تسجيل جماعي أو نقل جماعي حسب الحلقة
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-xl" style={tajawal}>
          <Link to="/admin/students">← قائمة الطلاب</Link>
        </Button>
      </div>

      {!hasApi && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-900 dark:text-amber-200 text-sm"
          style={tajawal}
        >
          أعد تسجيل الدخول بالجوال لربط API.
        </div>
      )}

      {error && (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 text-sm"
          style={tajawal}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm"
          style={tajawal}
        >
          تمت معالجة {result.total} صف — نجاح {result.success} — فشل {result.failed}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f]">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-white" style={tajawal}>
              القالب والتصدير
            </CardTitle>
            <CardDescription style={tajawal}>
              العناوين: الاسم، الهوية، الجنسية، الجوال، المدرسة، الصف، الحفظ، ولي
              الأمر، الحلقة، الصحة
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl gap-2"
              onClick={downloadTemplate}
              style={tajawal}
            >
              <FileDown className="w-4 h-4" />
              تحميل قالب Excel
            </Button>
            <Button
              type="button"
              className="rounded-xl gap-2 bg-[#1e3a8a] hover:bg-[#1e40af] text-white"
              onClick={runExport}
              disabled={loading || !hasApi}
              style={tajawal}
            >
              <FileDown className="w-4 h-4" />
              تصدير الطلاب الحاليين
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f]">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-white" style={tajawal}>
              رفع الملف
            </CardTitle>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "register" ? "default" : "outline"}
                className={
                  mode === "register"
                    ? "bg-[#1e3a8a] rounded-xl"
                    : "rounded-xl"
                }
                onClick={() => setMode("register")}
                style={tajawal}
              >
                تسجيل جماعي
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "transfer" ? "default" : "outline"}
                className={
                  mode === "transfer"
                    ? "bg-[#1e3a8a] rounded-xl"
                    : "rounded-xl"
                }
                onClick={() => setMode("transfer")}
                style={tajawal}
              >
                نقل جماعي (حلقة فقط)
              </Button>
            </div>
            <CardDescription className="mt-2" style={tajawal}>
              {mode === "register"
                ? "إضافة/تحديث بيانات الطلاب + الحلقة"
                : "نقل موجودين بالهوية/الجوال إلى حلقة جديدة (تراكمي)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-[#1e3a5f] rounded-2xl p-8 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#132337]">
              <Upload className="w-10 h-10 text-[#1e3a8a] mb-2" />
              <span className="text-sm text-slate-600 dark:text-slate-300" style={tajawal}>
                اختر ملف .xlsx
              </span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={onFile}
              />
            </label>
            {preview.length > 0 && (
              <>
                <p className="text-sm text-slate-500" style={tajawal}>
                  معاينة: {preview.length} صف
                </p>
                <Button
                  type="button"
                  className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl gap-2"
                  onClick={runImport}
                  disabled={loading || !hasApi}
                  style={tajawal}
                >
                  <FileUp className="w-4 h-4" />
                  {loading ? "جاري المعالجة..." : "تأكيد الاستيراد"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {preview.length > 0 && (
        <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f] overflow-hidden">
          <CardHeader>
            <CardTitle style={tajawal}>معاينة البيانات</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={tajawal}>الاسم</TableHead>
                  <TableHead style={tajawal}>الهوية</TableHead>
                  <TableHead style={tajawal}>الجوال</TableHead>
                  <TableHead style={tajawal}>الحلقة</TableHead>
                  <TableHead style={tajawal}>المدرسة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 15).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell style={tajawal}>{r.full_name_ar}</TableCell>
                    <TableCell style={tajawal}>{r.national_id ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{r.phone ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{r.circle_name ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{r.school_name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.length > 15 && (
              <p className="text-xs text-slate-500 mt-2" style={tajawal}>
                + {preview.length - 15} صف إضافي
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
