import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { StudentsExcelPanel } from "../../components/admin/StudentsExcelPanel";
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
import { ds, tajawal } from "../../lib/design-system";

type Tab = "list" | "excel";

export function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab =
    searchParams.get("excel") === "1" || searchParams.get("tab") === "excel"
      ? "excel"
      : "list";

  const [q, setQ] = useState("");
  const [items, setItems] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasApi = Boolean(getApiToken());

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    if (!hasApi) {
      setError("أعد تسجيل الدخول لربط النظام");
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
    if (tab === "list") {
      const t = setTimeout(() => load(q), 300);
      return () => clearTimeout(t);
    }
  }, [q, load, tab]);

  function setTab(next: Tab) {
    const params = new URLSearchParams(searchParams);
    if (next === "excel") {
      params.set("excel", "1");
      if (!params.get("tab") || params.get("tab") === "excel") {
        params.set("tab", "students");
      }
    } else {
      params.delete("excel");
      if (params.get("tab") === "excel") params.delete("tab");
    }
    setSearchParams(params);
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            إدارة الطلاب
          </h2>
          <p className={ds.page.description} style={tajawal}>
            عرض القائمة أو التعامل مع ملف Excel — من مكان واحد
          </p>
        </div>
        <Badge variant="secondary" className="rounded-xl" style={tajawal}>
          {tab === "list" ? `${items.length} طالب` : "ملف Excel"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "list" ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => setTab("list")}
          style={tajawal}
        >
          قائمة الطلاب
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "excel" ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => setTab("excel")}
          style={tajawal}
        >
          ملف Excel (تسجيل / نقل جماعي)
        </Button>
      </div>

      {tab === "excel" ? (
        <StudentsExcelPanel />
      ) : (
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle className={ds.page.section} style={tajawal}>
              قائمة الطلاب
            </CardTitle>
            <CardDescription style={tajawal}>
              ابحث بالاسم — جميع الحقول المسجّلة في النظام
            </CardDescription>
            <div className="relative max-w-md mt-4">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ابحث باسم الطالب..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className={`pr-10 ${ds.btnRound}`}
                style={tajawal}
              />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {error && (
              <div className={`${ds.alert.error} mb-4`} style={tajawal}>
                {error}
              </div>
            )}
            {loading ? (
              <p className="text-muted-foreground" style={tajawal}>
                جاري التحميل...
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={tajawal}>الاسم</TableHead>
                    <TableHead style={tajawal}>الهوية</TableHead>
                    <TableHead style={tajawal}>الجوال</TableHead>
                    <TableHead style={tajawal}>الحلقة</TableHead>
                    <TableHead style={tajawal}>المدرسة</TableHead>
                    <TableHead style={tajawal}>الصف</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium" style={tajawal}>
                        <Link
                          to={`/edu-supervisor/students/${s.id}`}
                          className="text-primary hover:underline"
                        >
                          {s.full_name_ar}
                        </Link>
                      </TableCell>
                      <TableCell style={tajawal}>{s.national_id ?? "—"}</TableCell>
                      <TableCell style={tajawal}>{s.phone ?? "—"}</TableCell>
                      <TableCell style={tajawal}>{s.circle_name ?? "—"}</TableCell>
                      <TableCell style={tajawal}>{s.school_name ?? "—"}</TableCell>
                      <TableCell style={tajawal}>{s.school_grade ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && !loading && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground"
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
      )}
    </div>
  );
}
