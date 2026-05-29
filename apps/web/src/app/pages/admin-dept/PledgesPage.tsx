import { useState } from "react";
import { FileText, Plus, Printer } from "lucide-react";
import { StudentSearchSelect } from "../../components/admin/StudentSearchSelect";
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
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function PledgesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [pledgeDate, setPledgeDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [report, setReport] = useState<Awaited<
    ReturnType<typeof api.adminDeptPledgeReport>
  > | null>(null);

  async function addPledge(e: React.FormEvent) {
    e.preventDefault();
    if (!canUseApi() || studentId == null || !reason.trim()) {
      setError("اختر الطالب وأدخل سبب التعهد");
      return;
    }
    setSubmitting(true);
    setError(null);
    setAlertMsg(null);
    try {
      const res = await api.adminDeptAddPledge({
        student_id: studentId,
        reason_ar: reason.trim(),
        pledge_date: pledgeDate,
      });
      if (res.threshold_reached && res.alert) setAlertMsg(res.alert);
      setReason("");
      setModalOpen(false);
      await loadReport(studentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إضافة التعهد");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadReport(sid?: number) {
    const id = sid ?? studentId;
    if (!canUseApi() || id == null) return;
    setError(null);
    try {
      const res = await api.adminDeptPledgeReport(id);
      setReport(res);
      if (res.threshold_reached) {
        setAlertMsg(
          `تنبيه: بلغ الطالب الحد الأعلى (${res.pledge_count} / ${res.max_pledges} تعهدات).`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل التقرير");
      setReport(null);
    }
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="space-y-4 max-w-[900px]">
      <div className="print:hidden flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            التعهدات والإجراءات
          </h2>
          <p className={ds.page.description} style={tajawal}>
            إضافة تعهد تراكمي مع تنبيه عند بلوغ الحد من إعدادات المجمع.
          </p>
        </div>
        <Button
          type="button"
          className={ds.btnRound}
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
          style={tajawal}
        >
          <Plus className="w-4 h-4" />
          إضافة تعهد
        </Button>
      </div>

      {error && (
        <p className={`${ds.alert.error} print:hidden`} style={tajawal}>
          {error}
        </p>
      )}
      {alertMsg && (
        <p className={`${ds.alert.error} print:hidden`} style={tajawal}>
          {alertMsg}
        </p>
      )}

      <div className={`${ds.card} p-4 print:hidden space-y-3`}>
        <Label style={tajawal}>بحث عن طالب لعرض سجل التعهدات</Label>
        <StudentSearchSelect
          value={studentId}
          onChange={(id) => {
            setStudentId(id);
            setReport(null);
            if (id != null) void loadReport(id);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className={ds.btnRound}
          disabled={studentId == null}
          onClick={() => loadReport()}
          style={tajawal}
        >
          عرض التقرير
        </Button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>إضافة تعهد</DialogTitle>
            <DialogDescription style={tajawal}>
              ابحث عن الطالب بالاسم ثم أدخل سبب التعهد.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addPledge} className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>الطالب *</Label>
              <StudentSearchSelect
                value={studentId}
                onChange={setStudentId}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>تاريخ التعهد</Label>
              <Input
                type="date"
                value={pledgeDate}
                onChange={(e) => setPledgeDate(e.target.value)}
                className={ds.btnRound}
              />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>سبب التعهد *</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className={ds.btnRound}
              />
            </div>
            <Button
              type="submit"
              className={`w-full ${ds.btnRound}`}
              disabled={submitting}
              style={tajawal}
            >
              {submitting ? "جاري الحفظ…" : "حفظ التعهد"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {report && (
        <div id="pledge-print" className={`${ds.card} p-4 space-y-3`}>
          <div className="flex justify-between items-start gap-2 print:hidden">
            <div>
              <p className="font-bold" style={tajawal}>
                {(report.student as { full_name_ar?: string }).full_name_ar ??
                  "الطالب"}
              </p>
              <p className="text-sm text-muted-foreground" style={tajawal}>
                عدد التعهدات: {report.pledge_count} / {report.max_pledges}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={ds.btnRound}
              onClick={printReport}
            >
              <Printer className="w-4 h-4" />
              طباعة
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {report.pledges.map((p) => (
              <li
                key={p.id}
                className="border-b border-border pb-2 flex justify-between gap-2"
                style={tajawal}
              >
                <span>{p.reason_ar}</span>
                <span className="text-muted-foreground shrink-0">{p.pledge_date}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
