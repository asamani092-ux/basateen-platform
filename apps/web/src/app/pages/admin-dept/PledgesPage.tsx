import { useState } from "react";
import { FileText, Printer } from "lucide-react";
import { StudentSearchSelect } from "../../components/admin/StudentSearchSelect";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function PledgesPage() {
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
      <div className="print:hidden">
        <h2 className={ds.page.title} style={tajawal}>
          التعهدات والإجراءات
        </h2>
        <p className={ds.page.description} style={tajawal}>
          إضافة تعهد تراكمي مع تنبيه عند بلوغ الحد من إعدادات المجمع.
        </p>
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

      <form
        onSubmit={addPledge}
        className={`${ds.card} p-4 space-y-4 print:hidden`}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2 sm:col-span-2">
            <Label style={tajawal}>الطالب *</Label>
            <StudentSearchSelect
              value={studentId}
              onChange={(id) => {
                setStudentId(id);
                setReport(null);
              }}
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
          <div className="space-y-2 sm:col-span-2">
            <Label style={tajawal}>سبب التعهد *</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={ds.btnRound}
              style={tajawal}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={submitting}
            className={ds.btnRound}
            style={tajawal}
          >
            {submitting ? "جاري الحفظ…" : "إضافة تعهد"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={ds.btnRound}
            onClick={() => loadReport()}
            disabled={studentId == null}
            style={tajawal}
          >
            <FileText className="w-4 h-4" />
            عرض تقرير الطالب
          </Button>
        </div>
      </form>

      {report && (
        <div id="pledge-report-print" className={`${ds.card} p-6 space-y-4`}>
          <div className="flex justify-between items-start gap-4 print:hidden">
            <div>
              <h3 className={ds.page.section} style={tajawal}>
                تقرير تعهدات الطالب
              </h3>
              <p className="text-sm text-muted-foreground" style={tajawal}>
                {String(report.student?.full_name_ar ?? "")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              onClick={printReport}
              style={tajawal}
            >
              <Printer className="w-4 h-4" />
              طباعة / PDF
            </Button>
          </div>

          <div className="hidden print:block text-center border-b pb-4 mb-4">
            <h1 className="text-xl font-bold" style={tajawal}>
              تقرير تعهدات — مجمع البساتين
            </h1>
            <p style={tajawal}>
              {String(report.student?.full_name_ar ?? "")} ·{" "}
              {new Date().toLocaleDateString("ar-SA")}
            </p>
          </div>

          <p className={ds.alert.info} style={tajawal}>
            عدد التعهدات: {report.pledge_count} من أصل {report.max_pledges}
            {report.threshold_reached ? " — تجاوز الحد" : ""}
          </p>

          <ul className="space-y-3">
            {report.pledges.map((p) => (
              <li
                key={p.id}
                className="border border-border rounded-xl p-3 text-sm"
                style={tajawal}
              >
                <p className="font-medium">{p.pledge_date}</p>
                <p>{p.reason_ar}</p>
                {p.created_by_name && (
                  <p className="text-xs text-muted-foreground mt-1">
                    سجّله: {p.created_by_name}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {report.pledges.length === 0 && (
            <p style={tajawal}>لا توجد تعهدات مسجلة.</p>
          )}
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pledge-report-print, #pledge-report-print * { visibility: visible; }
          #pledge-report-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
}
