import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Search } from "lucide-react";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { StudentsExcelPanel } from "../../components/admin/StudentsExcelPanel";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
import {
  api,
  type CircleOption,
  type StudentRow,
} from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";

type Tab = "list" | "bulk";

export function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab =
    searchParams.get("bulk") === "1" ||
    searchParams.get("excel") === "1" ||
    searchParams.get("tab") === "bulk"
      ? "bulk"
      : "list";

  const [q, setQ] = useState("");
  const [items, setItems] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [transferStudent, setTransferStudent] = useState<StudentRow | null>(null);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const hasApi = Boolean(getApiToken());

  useEffect(() => {
    if (!hasApi) return;
    void api.circles().then((res) => setCircles(res.items)).catch(() => setCircles([]));
  }, [hasApi]);

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
      const payload = res as {
        items?: StudentRow[];
        error?: string;
        message?: string;
      };
      if (payload.error) {
        setError(payload.message ?? "تعذّر تحميل قائمة الطلاب");
        setItems(payload.items ?? []);
      } else {
        setItems(payload.items ?? []);
      }
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
    if (next === "bulk") {
      params.set("bulk", "1");
      params.delete("excel");
    } else {
      params.delete("bulk");
      params.delete("excel");
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
          {tab === "list" ? `${items.length} طالب` : "إضافة جماعية"}
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
          variant={tab === "bulk" ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => setTab("bulk")}
          style={tajawal}
        >
          إضافة جماعية (لصق نصي)
        </Button>
      </div>

      {tab === "bulk" ? (
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
              <Table className={ds.tableMin}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={ds.table.head} style={tajawal}>
                      الاسم
                    </TableHead>
                    <TableHead className={ds.table.head} style={tajawal}>
                      الهوية
                    </TableHead>
                    <TableHead className={ds.table.head} style={tajawal}>
                      الجوال
                    </TableHead>
                    <TableHead className={ds.table.head} style={tajawal}>
                      الحلقة
                    </TableHead>
                    <TableHead className={ds.table.head} style={tajawal}>
                      المدرسة
                    </TableHead>
                    <TableHead className={ds.table.head} style={tajawal}>
                      الصف
                    </TableHead>
                    <TableHead className={ds.table.headActions} style={tajawal}>
                      إجراءات
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium" style={tajawal}>
                        {s.full_name_ar}
                      </TableCell>
                      <TableCell style={tajawal}>{s.national_id ?? "—"}</TableCell>
                      <TableCell style={tajawal}>{s.phone ?? "—"}</TableCell>
                      <TableCell style={tajawal}>{s.circle_name ?? "—"}</TableCell>
                      <TableCell style={tajawal}>{s.school_name ?? "—"}</TableCell>
                      <TableCell style={tajawal}>{s.school_grade ?? "—"}</TableCell>
                      <TableActionsCell wide>
                        <TableIconAction
                          kind="edit"
                          onClick={() => setEditStudent(s)}
                        />
                        <TableIconAction
                          kind="transfer"
                          onClick={() => setTransferStudent(s)}
                        />
                        <TableIconAction
                          kind="delete"
                          onClick={async () => {
                            if (
                              !confirm(
                                `حذف الطالب «${s.full_name_ar}» من القائمة النشطة؟`,
                              )
                            ) {
                              return;
                            }
                            try {
                              await api.studentsDelete(s.id);
                              setItems((prev) => prev.filter((x) => x.id !== s.id));
                            } catch (e) {
                              setError(
                                e instanceof Error ? e.message : "فشل الحذف",
                              );
                            }
                          }}
                        />
                      </TableActionsCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && !loading && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
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

      {editStudent && (
        <StudentEditDialog
          student={editStudent}
          open
          onOpenChange={(o) => {
            if (!o) setEditStudent(null);
          }}
          onSaved={(updated) => {
            setItems((prev) =>
              prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)),
            );
            setEditStudent(null);
          }}
        />
      )}

      {transferStudent && (
        <StudentTransferDialog
          student={transferStudent}
          circles={circles}
          open
          onOpenChange={(o) => {
            if (!o) setTransferStudent(null);
          }}
          onTransferred={(circleName) => {
            setItems((prev) =>
              prev.map((x) =>
                x.id === transferStudent.id
                  ? { ...x, circle_name: circleName }
                  : x,
              ),
            );
            setTransferStudent(null);
          }}
        />
      )}
    </div>
  );
}

function StudentEditDialog({
  student,
  open,
  onOpenChange,
  onSaved,
}: {
  student: StudentRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (student: StudentRow) => void;
}) {
  const [name, setName] = useState(student.full_name_ar);
  const [phone, setPhone] = useState(student.phone ?? "");
  const [guardianPhone, setGuardianPhone] = useState(student.guardian_phone ?? "");
  const [school, setSchool] = useState(student.school_name ?? "");
  const [grade, setGrade] = useState(student.school_grade ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(student.full_name_ar);
    setPhone(student.phone ?? "");
    setGuardianPhone(student.guardian_phone ?? "");
    setSchool(student.school_name ?? "");
    setGrade(student.school_grade ?? "");
    setError(null);
  }, [open, student]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.studentsPatch(student.id, {
        full_name_ar: name.trim(),
        phone: phone.trim() || null,
        guardian_phone: guardianPhone.trim() || null,
        school_name: school.trim() || null,
        school_grade: grade.trim() || null,
      });
      onSaved({
        ...student,
        full_name_ar: name.trim(),
        phone: phone.trim() || null,
        guardian_phone: guardianPhone.trim() || null,
        school_name: school.trim() || null,
        school_grade: grade.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.card} max-w-md`} dir="rtl">
        <DialogHeader>
          <DialogTitle style={tajawal}>تعديل طالب</DialogTitle>
          <DialogDescription style={tajawal}>{student.full_name_ar}</DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        <form onSubmit={save} className="grid gap-3">
          <div>
            <Label style={tajawal}>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label style={tajawal}>جوال الطالب</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label style={tajawal}>جوال ولي الأمر</Label>
            <Input
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
            />
          </div>
          <div>
            <Label style={tajawal}>المدرسة</Label>
            <Input value={school} onChange={(e) => setSchool(e.target.value)} />
          </div>
          <div>
            <Label style={tajawal}>الصف</Label>
            <Input value={grade} onChange={(e) => setGrade(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
            {saving ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StudentTransferDialog({
  student,
  circles,
  open,
  onOpenChange,
  onTransferred,
}: {
  student: StudentRow;
  circles: CircleOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred: (circleName: string) => void;
}) {
  const [circleId, setCircleId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!circleId) {
      setError("اختر الحلقة الهدف");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const target = circles.find((c) => c.id === Number(circleId));
      await api.transferStudent(student.id, {
        circle_id: Number(circleId),
        track_id: target?.track_id ?? null,
        note: note.trim() || undefined,
      });
      onTransferred(target?.name_ar ?? "—");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل النقل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.card} max-w-md`} dir="rtl">
        <DialogHeader>
          <DialogTitle style={tajawal}>نقل طالب</DialogTitle>
          <DialogDescription style={tajawal}>{student.full_name_ar}</DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        <form onSubmit={save} className="grid gap-3">
          <div>
            <Label style={tajawal}>الحلقة الجديدة</Label>
            <select
              value={circleId}
              onChange={(e) => setCircleId(e.target.value)}
              className={ds.select}
              style={tajawal}
              required
            >
              <option value="">— اختر —</option>
              {circles.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label style={tajawal}>ملاحظة (اختياري)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
            {saving ? "جاري النقل…" : "تأكيد النقل"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
