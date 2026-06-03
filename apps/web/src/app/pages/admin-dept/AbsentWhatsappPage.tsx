import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
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
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const sendableItems = useMemo(
    () => items.filter((r) => Boolean(r.whatsapp_url)),
    [items],
  );

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

  async function handleBulkSend() {
    if (sendableItems.length === 0 || bulkSending) return;

    setBulkSending(true);
    setBulkProgress({ current: 0, total: sendableItems.length });

    try {
      let index = 0;
      for (const row of sendableItems) {
        index += 1;
        setBulkProgress({ current: index, total: sendableItems.length });
        if (row.whatsapp_url) {
          window.open(row.whatsapp_url, "_blank", "noopener,noreferrer");
        }
        if (index < sendableItems.length) {
          await new Promise((resolve) => setTimeout(resolve, 20000));
        }
      }
      toast.success("تم الانتهاء من الإرسال الجماعي بنجاح");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "تعذّر إكمال الإرسال الجماعي",
      );
    } finally {
      setBulkSending(false);
      setBulkProgress({ current: 0, total: 0 });
    }
  }

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

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className={`${ds.btnRound} w-full sm:w-auto min-h-11`}
            disabled={bulkSending || sendableItems.length === 0 || loading}
            onClick={() => void handleBulkSend()}
            style={tajawal}
          >
            إرسال جماعي للغائبين 🚀
          </Button>
          {bulkSending && bulkProgress.total > 0 && (
            <p className="text-sm text-muted-foreground" style={tajawal}>
              جاري إرسال {bulkProgress.current} من {bulkProgress.total}... يرجى
              الانتظار
            </p>
          )}
          {sendableItems.length === 0 && items.length > 0 && (
            <p className={`text-sm ${ds.alert.info}`} style={tajawal}>
              لا يوجد أرقام واتساب صالحة للإرسال الجماعي.
            </p>
          )}
        </div>
      )}

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
                <TableHead className={`${ds.table.head} w-[24%]`} style={tajawal}>
                  الطالب
                </TableHead>
                <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                  الحلقة
                </TableHead>
                <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                  الحالة
                </TableHead>
                <TableHead className={`${ds.table.head} w-[20%]`} style={tajawal}>
                  ولي الأمر
                </TableHead>
                <TableHead className={ds.table.headActions} style={tajawal}>
                  واتساب
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.student_id}>
                  <TableCell className={`${ds.table.cell} font-medium`} style={tajawal}>
                    {r.full_name_ar}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {r.circle_name ?? "—"}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {r.status === "excused" ? "مستأذن" : "غائب"}
                  </TableCell>
                  <TableCell
                    className={`${ds.table.cell} text-muted-foreground font-mono`}
                    dir="ltr"
                  >
                    {r.guardian_phone ?? "—"}
                  </TableCell>
                  <TableActionsCell>
                    {r.whatsapp_url ? (
                      <TableIconAction
                        kind="whatsapp"
                        href={r.whatsapp_url}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground" style={tajawal}>
                        —
                      </span>
                    )}
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
