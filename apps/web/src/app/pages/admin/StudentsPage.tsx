import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
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
import { isMockAuth } from "../../lib/auth-store";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

const DEMO_STUDENTS: StudentRow[] = [
  { id: 1, full_name_ar: "أحمد محمد العتيبي", phone: "0500000001", circle_name: "حلقة الصديق", track_name: "مسار الحفظ" },
  { id: 2, full_name_ar: "خالد سعود القحطاني", phone: "0500000002", circle_name: "حلقة الصديق", track_name: "مسار الحفظ" },
  { id: 3, full_name_ar: "فهد عبدالله الشمري", phone: "0500000003", circle_name: "حلقة الصديق", track_name: "مسار الحفظ" },
  { id: 4, full_name_ar: "سلمان ناصر الحربي", phone: "0500000004", circle_name: "حلقة النور", track_name: "مسار الحفظ" },
];

export function StudentsPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    const q = query.trim().toLowerCase();

    if (isMockAuth()) {
      const filtered = DEMO_STUDENTS.filter(
        (s) => !q || s.full_name_ar.toLowerCase().includes(q),
      );
      setItems(filtered);
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
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white" style={tajawal}>
            إدارة الطلاب
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mt-1" style={tajawal}>
            بحث بالاسم — عرض الحلقة والمسار الحالي
          </p>
        </div>
        <Badge className="rounded-xl" style={tajawal}>
          {items.length} طالب
        </Badge>
      </div>

      <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f]">
        <CardHeader>
          <CardTitle style={tajawal}>قائمة الطلاب</CardTitle>
          <CardDescription style={tajawal}>
            ابحث بالاسم لعرض الطلاب النشطين في حلقاتهم الحالية
          </CardDescription>
          <div className="relative max-w-md mt-4">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="ابحث باسم الطالب..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pr-10 rounded-xl"
              style={tajawal}
            />
          </div>
        </CardHeader>
        <CardContent>
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
                  <TableHead style={tajawal}>الاسم</TableHead>
                  <TableHead style={tajawal}>الحلقة</TableHead>
                  <TableHead style={tajawal}>المسار</TableHead>
                  <TableHead style={tajawal}>الجوال</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium" style={tajawal}>
                      {s.full_name_ar}
                    </TableCell>
                    <TableCell style={tajawal}>{s.circle_name ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{s.track_name ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{s.phone ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500" style={tajawal}>
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
