import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Copy, Plus } from "lucide-react";
import { TableIconAction } from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type DayRow = {
  id: number;
  name_ar: string;
  event_date: string;
  deduction_rules: { mistake_penalty: number; alert_penalty: number };
  has_magic_link: boolean;
  is_active: number;
};

export function QuranicDaysManagerPage() {
  const [items, setItems] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mistakePenalty, setMistakePenalty] = useState(1);
  const [alertPenalty, setAlertPenalty] = useState(0.5);
  const [submitting, setSubmitting] = useState(false);
  const [linkBusy, setLinkBusy] = useState<number | null>(null);
  const [lastLink, setLastLink] = useState("");

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptQuranicDaysList();
      setItems(res.items as DayRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createDay(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.eduDeptQuranicDayCreate({
        name_ar: name.trim(),
        event_date: eventDate,
        mistake_penalty: mistakePenalty,
        alert_penalty: alertPenalty,
      });
      setCreateOpen(false);
      setName("");
      setSuccess("تم إنشاء اليوم القرآني.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإنشاء");
    } finally {
      setSubmitting(false);
    }
  }

  async function generateLink(dayId: number) {
    setLinkBusy(dayId);
    setError(null);
    try {
      const res = await api.eduDeptQuranicDayMagicLink(dayId);
      const full =
        typeof window !== "undefined"
          ? `${window.location.origin}${res.public_path}`
          : res.public_path;
      setLastLink(full);
      setSuccess("تم توليد رابط المقرئين.");
      await load();
      await navigator.clipboard.writeText(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل توليد الرابط");
    } finally {
      setLinkBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-[1000px]">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <CalendarDays className="w-7 h-7 text-primary" />
            اليوم القرآني / يوم الهمة
          </h2>
          <p className={ds.page.description} style={tajawal}>
            إنشاء الأيام المكثفة وقواعد الخصم وروابط المقرئين العامة.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          className={ds.btnRound}
          onClick={() => setCreateOpen(true)}
          style={tajawal}
        >
          <Plus className="w-4 h-4" />
          يوم قرآني جديد
        </Button>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}
      {success && (
        <p className={ds.alert.success} style={tajawal}>
          {success}
        </p>
      )}
      {lastLink && (
        <div className={`${ds.card} p-4 flex flex-wrap items-center gap-2`}>
          <span className="text-sm break-all flex-1" style={tajawal}>
            {lastLink}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ds.btnRound}
            onClick={() => navigator.clipboard.writeText(lastLink)}
          >
            <Copy className="w-4 h-4" />
            نسخ
          </Button>
        </div>
      )}

      <div className={ds.card}>
        {loading ? (
          <p className="p-4 text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : items.length === 0 ? (
          <p className={`p-4 m-4 ${ds.alert.info}`} style={tajawal}>
            لا توجد أيام قرآنية بعد.
          </p>
        ) : (
          <Table className={ds.tableMin}>
            <TableHeader>
              <TableRow>
                <TableHead className={ds.table.head} style={tajawal}>
                  الاسم
                </TableHead>
                <TableHead className={ds.table.head} style={tajawal}>
                  التاريخ
                </TableHead>
                <TableHead className={ds.table.head} style={tajawal}>
                  خصم خطأ / تنبيه
                </TableHead>
                <TableHead className={ds.table.headActions} style={tajawal}>
                  رابط
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {d.name_ar}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {d.event_date}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {d.deduction_rules.mistake_penalty} / {d.deduction_rules.alert_penalty}
                  </TableCell>
                  <TableCell className={ds.table.cell}>
                    <TableIconAction
                      kind="copy"
                      label={d.has_magic_link ? "نسخ / تجديد الرابط" : "توليد رابط المقرئين"}
                      disabled={linkBusy === d.id}
                      onClick={() => generateLink(d.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={`${ds.card} max-w-md rounded-2xl`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>يوم قرآني جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={createDay} className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>اسم اليوم</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={ds.btnRound}
                required
              />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>التاريخ</Label>
              <Input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className={ds.btnRound}
              />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>خصم لكل خطأ</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                value={mistakePenalty}
                onChange={(e) => setMistakePenalty(Number(e.target.value))}
                className={ds.btnRound}
              />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>خصم لكل تنبيه</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                value={alertPenalty}
                onChange={(e) => setAlertPenalty(Number(e.target.value))}
                className={ds.btnRound}
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className={`w-full ${ds.btnRound}`}
              style={tajawal}
            >
              {submitting ? "جاري الحفظ…" : "إنشاء"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
