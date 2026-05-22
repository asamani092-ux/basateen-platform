import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { FileSpreadsheet, Search } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
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
import { Badge } from "../../components/ui/badge";
import { api, type StudentRow } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function StudentsPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasApi = Boolean(getApiToken());

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    if (!hasApi) {
      setError("أعد تسجيل الدخول لربط API");
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const res = await api.students(query);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الطلاب");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [hasApi]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            className="text-2xl font-bold text-slate-900 dark:text-white"
            style={tajawal}
          >
            إدارة الطلاب
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mt-1" style={tajawal}>
            بيانات كاملة — استيراد وتصدير Excel
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-xl" style={tajawal}>
            {items.length} طالب
          </Badge>
          <Button
            asChild
            className="bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl gap-2"
            style={tajawal}
          >
            <Link to="/admin/students/import">
              <FileSpreadsheet className="w-4 h-4" />
              Excel استيراد/تصدير
            </Link>
          </Button>
        </div>
      </div>

      <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f]">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-white" style={tajawal}>
            قائمة الطلاب
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-300" style={tajawal}>
            الاسم، الهوية، الجنسية، الجوال، المدرسة، الصف، الحفظ، ولي الأمر، الحلقة،
            الصحة
          </CardDescription>
          <div className="relative max-w-md mt-4">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="ابحث باسم الطالب..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pr-10 rounded-xl text-slate-900 dark:text-white"
              style={tajawal}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {error && (
            <p className="text-rose-600 text-sm mb-4" style={tajawal}>
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-slate-500" style={tajawal}>
              جاري التحميل...
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={tajawal}>الاسم الرباعي</TableHead>
                  <TableHead style={tajawal}>الهوية</TableHead>
                  <TableHead style={tajawal}>الجنسية</TableHead>
                  <TableHead style={tajawal}>الجوال</TableHead>
                  <TableHead style={tajawal}>المدرسة</TableHead>
                  <TableHead style={tajawal}>الصف</TableHead>
                  <TableHead style={tajawal}>الحفظ</TableHead>
                  <TableHead style={tajawal}>ولي الأمر</TableHead>
                  <TableHead style={tajawal}>الحلقة</TableHead>
                  <TableHead style={tajawal}>صحة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium whitespace-nowrap" style={tajawal}>
                      {s.full_name_ar}
                    </TableCell>
                    <TableCell style={tajawal}>{s.national_id ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{s.nationality ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{s.phone ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{s.school_name ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{s.school_grade ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{s.memorization_amount ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{s.guardian_phone ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{s.circle_name ?? "—"}</TableCell>
                    <TableCell className="max-w-[120px] truncate" style={tajawal}>
                      {s.health_notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center text-slate-500"
                      style={tajawal}
                    >
                      لا توجد نتائج
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
