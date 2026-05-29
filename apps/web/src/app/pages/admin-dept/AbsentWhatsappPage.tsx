import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type AbsentRow = {
  student_id: number;
  full_name_ar: string;
  guardian_phone?: string;
  status: string;
  circle_name?: string | null;
  whatsapp_url: string | null;
  whatsapp_message?: string;
};

export function AbsentWhatsappPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [circleId, setCircleId] = useState<string>("all");
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [items, setItems] = useState<AbsentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseApi()) return;
    api.circles().then((r) => setCircles(r.items ?? [])).catch(() => setCircles([]));
  }, []);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptAbsentToday({
        date,
        circle_id: circleId !== "all" ? Number(circleId) : undefined,
      });
      setItems((res.items ?? []) as AbsentRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [date, circleId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          واتساب الغياب اليومي
        </h2>
        <p className={ds.page.description} style={tajawal}>
          الطلاب الغائبون والمستأذنون لهذا اليوم — رسالة جاهزة لولي الأمر.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 flex flex-col sm:flex-row gap-4`}>
        <div>
          <Label style={tajawal}>التاريخ</Label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`block mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
          />
        </div>
        <div className="flex-1">
          <Label style={tajawal}>الحلقة (اختياري)</Label>
          <Select value={circleId} onValueChange={setCircleId}>
            <SelectTrigger className={`mt-1 ${ds.btnRound}`}>
              <SelectValue placeholder="كل الحلقات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحلقات</SelectItem>
              {circles.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name_ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className={ds.btnRound}
            onClick={load}
            disabled={loading}
            style={tajawal}
          >
            تحديث
          </Button>
        </div>
      </div>

      <div className={ds.card}>
        {loading ? (
          <p className="p-4 text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : items.length === 0 ? (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            لا يوجد غائبون مسجلون لهذا اليوم.
          </p>
        ) : (
          <Table className={ds.tableMin}>
            <TableHeader>
              <TableRow>
                <TableHead style={tajawal}>الطالب</TableHead>
                <TableHead style={tajawal}>الحلقة</TableHead>
                <TableHead style={tajawal}>الحالة</TableHead>
                <TableHead style={tajawal}>ولي الأمر</TableHead>
                <TableHead style={tajawal}>واتساب</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.student_id}>
                  <TableCell className="font-medium" style={tajawal}>
                    {r.full_name_ar}
                  </TableCell>
                  <TableCell style={tajawal}>{r.circle_name ?? "—"}</TableCell>
                  <TableCell style={tajawal}>
                    {r.status === "excused" ? "مستأذن" : "غائب"}
                  </TableCell>
                  <TableCell dir="ltr" className="text-muted-foreground">
                    {r.guardian_phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    {r.whatsapp_url ? (
                      <Button
                        asChild
                        size="sm"
                        className={ds.btnRound}
                        style={tajawal}
                      >
                        <a
                          href={r.whatsapp_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="w-4 h-4" />
                          إرسال واتساب
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground" style={tajawal}>
                        لا يوجد رقم
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
