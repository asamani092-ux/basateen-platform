import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Copy, Plus } from "lucide-react";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { QuranicDayStudentsModal } from "./QuranicDayStudentsModal";
import { QuranicDayRecordsModal } from "./QuranicDayRecordsModal";
import { QuranicDayReportModal } from "./QuranicDayReportModal";

export type DayRow = {
  id: number;
  name_ar: string;
  event_date: string;
  deduction_rules: {
    mistake_penalty: number;
    alert_penalty: number;
    lahn_penalty: number;
  };
  fail_threshold: number;
  hizb_time_limit: number;
  has_magic_link: boolean;
  is_active: number;
};

type DayForm = {
  name_ar: string;
  event_date: string;
  mistake_penalty: number;
  alert_penalty: number;
  lahn_penalty: number;
  fail_threshold: number;
  hizb_time_limit: number;
};

const emptyForm = (): DayForm => ({
  name_ar: "",
  event_date: new Date().toISOString().slice(0, 10),
  mistake_penalty: 1,
  alert_penalty: 0.5,
  lahn_penalty: 0.5,
  fail_threshold: 3,
  hizb_time_limit: 10,
});

export function QuranicDaysManagerPage() {
  const [items, setItems] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DayForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [studentsDay, setStudentsDay] = useState<DayRow | null>(null);
  const [recordsDay, setRecordsDay] = useState<DayRow | null>(null);
  const [reportDay, setReportDay] = useState<DayRow | null>(null);
  const [linkBusy, setLinkBusy] = useState<number | null>(null);
  const [lastLink, setLastLink] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DayRow | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(d: DayRow) {
    setEditId(d.id);
    setForm({
      name_ar: d.name_ar,
      event_date: d.event_date,
      mistake_penalty: d.deduction_rules.mistake_penalty,
      alert_penalty: d.deduction_rules.alert_penalty,
      lahn_penalty: d.deduction_rules.lahn_penalty ?? 0.5,
      fail_threshold: d.fail_threshold,
      hizb_time_limit: d.hizb_time_limit,
    });
    setFormOpen(true);
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name_ar.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        name_ar: form.name_ar.trim(),
        event_date: form.event_date,
        mistake_penalty: form.mistake_penalty,
        alert_penalty: form.alert_penalty,
        lahn_penalty: form.lahn_penalty,
        fail_threshold: form.fail_threshold,
        hizb_time_limit: form.hizb_time_limit,
      };
      if (editId != null) {
        await api.eduDeptQuranicDayUpdate(editId, body);
        setSuccess("تم تحديث اليوم القرآني.");
      } else {
        await api.eduDeptQuranicDayCreate(body);
        setSuccess("تم إنشاء اليوم القرآني.");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
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

  function startDelete(d: DayRow) {
    setDeleteTarget(d);
    setDeleteStep(1);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }
    setDeleteBusy(true);
    setError(null);
    try {
      await api.eduDeptQuranicDayDelete(deleteTarget.id);
      setSuccess("تم حذف اليوم القرآني وجميع سجلاته.");
      setDeleteTarget(null);
      setDeleteStep(0);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحذف");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <CalendarDays className="w-7 h-7 text-primary" />
            اليوم القرآني / يوم الهمة
          </h2>
          <p className={ds.page.description} style={tajawal}>
            إعدادات اليوم، تسجيل الطلاب مسبقاً، وروابط المقرئين.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          className={ds.btnRound}
          onClick={openCreate}
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
                  حد الرسوب / وقت الحزب
                </TableHead>
                <TableHead className={ds.table.headActions} style={tajawal}>
                  إجراءات
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
                  <TableCell className={`${ds.table.cell} text-sm`} style={tajawal}>
                    {d.fail_threshold} أخطاء · {d.hizb_time_limit} د
                  </TableCell>
                  <TableActionsCell>
                    <TableIconAction
                      kind="edit"
                      label="تعديل"
                      onClick={() => openEdit(d)}
                    />
                    <TableIconAction
                      kind="edit"
                      label="مراجعة/تعديل الرصد"
                      onClick={() => setRecordsDay(d)}
                    />
                    <TableIconAction
                      kind="print"
                      label="تقرير اليوم"
                      onClick={() => setReportDay(d)}
                    />
                    <TableIconAction
                      kind="capacity"
                      label="طلاب اليوم"
                      onClick={() => setStudentsDay(d)}
                    />
                    <TableIconAction
                      kind="copy"
                      label="رابط المقرئ"
                      disabled={linkBusy === d.id}
                      onClick={() => generateLink(d.id)}
                    />
                    <TableIconAction
                      kind="delete"
                      label="حذف"
                      onClick={() => startDelete(d)}
                    />
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={`${ds.card} max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>
              {editId != null ? "تعديل اليوم القرآني" : "يوم قرآني جديد"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveForm} className="space-y-3">
            <Field label="اسم اليوم" value={form.name_ar} onChange={(v) => setForm((f) => ({ ...f, name_ar: v }))} />
            <div className="space-y-1">
              <Label style={tajawal}>التاريخ</Label>
              <Input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                className={ds.btnRound}
              />
            </div>
            <NumField label="خصم الخطأ" value={form.mistake_penalty} onChange={(v) => setForm((f) => ({ ...f, mistake_penalty: v }))} />
            <NumField label="خصم التنبيه" value={form.alert_penalty} onChange={(v) => setForm((f) => ({ ...f, alert_penalty: v }))} />
            <NumField label="خصم اللحن" value={form.lahn_penalty} onChange={(v) => setForm((f) => ({ ...f, lahn_penalty: v }))} />
            <NumField label="حد الرسوب (أقصى أخطاء)" value={form.fail_threshold} step={1} onChange={(v) => setForm((f) => ({ ...f, fail_threshold: v }))} />
            <NumField label="وقت الحزب (دقائق)" value={form.hizb_time_limit} step={1} onChange={(v) => setForm((f) => ({ ...f, hizb_time_limit: v }))} />
            <Button type="submit" disabled={submitting} className={`w-full ${ds.btnRound}`} style={tajawal}>
              {submitting ? "جاري الحفظ…" : "حفظ"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget != null && deleteStep > 0}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteStep(0);
          }
        }}
      >
        <DialogContent className={`${ds.card} max-w-md rounded-2xl`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>
              {deleteStep === 1 ? "تأكيد الحذف" : "تأكيد نهائي"}
            </DialogTitle>
            <DialogDescription style={tajawal}>
              {deleteStep === 1
                ? `هل تريد حذف «${deleteTarget?.name_ar}»؟ سيتم حذف الطلاب المسجلين وسجلات الرصد.`
                : `اضغط «حذف نهائياً» لتأكيد حذف «${deleteTarget?.name_ar}» — لا يمكن التراجع.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-start">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteStep(0);
              }}
              style={tajawal}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={ds.btnRound}
              disabled={deleteBusy}
              onClick={() => confirmDelete()}
              style={tajawal}
            >
              {deleteStep === 1 ? "متابعة" : deleteBusy ? "جاري الحذف…" : "حذف نهائياً"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {studentsDay && (
        <QuranicDayStudentsModal
          dayId={studentsDay.id}
          dayName={studentsDay.name_ar}
          open={Boolean(studentsDay)}
          onOpenChange={(o) => !o && setStudentsDay(null)}
        />
      )}

      {recordsDay && (
        <QuranicDayRecordsModal
          dayId={recordsDay.id}
          dayName={recordsDay.name_ar}
          open={Boolean(recordsDay)}
          onOpenChange={(o) => !o && setRecordsDay(null)}
        />
      )}

      {reportDay && (
        <QuranicDayReportModal
          dayId={reportDay.id}
          dayName={reportDay.name_ar}
          open={Boolean(reportDay)}
          onOpenChange={(o) => !o && setReportDay(null)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label style={tajawal}>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className={ds.btnRound} required />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label style={tajawal}>{label}</Label>
      <Input
        type="number"
        step={step}
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={ds.btnRound}
      />
    </div>
  );
}
