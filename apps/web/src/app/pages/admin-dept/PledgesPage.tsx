import { useCallback, useEffect, useState } from "react";
import { Eye, FileText, Plus, Printer } from "lucide-react";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
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
import { TeacherEscalationsTab } from "./TeacherEscalationsTab";

type SummaryRow = {
  student_id: number;
  full_name_ar: string;
  guardian_phone: string | null;
  pledge_count: number;
  latest_reason: string | null;
};

type PledgeReport = Awaited<ReturnType<typeof api.adminDeptPledgeReport>>;

function todayAr(): string {
  return new Date().toLocaleDateString("ar-SA");
}

function printPledgeForm(
  studentName: string,
  guardianPhone: string | null,
  pledges: PledgeReport["pledges"],
  pledgeCount: number,
) {
  const rows = pledges
    .map(
      (p) =>
        `<tr><td>${p.pledge_date}</td><td>${p.reason_ar}</td><td>${p.created_by_name ?? "—"}</td></tr>`,
    )
    .join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
    <meta charset="utf-8"/><title>نموذج تعهد — ${studentName}</title>
    <style>
      body{font-family:Tajawal,sans-serif;padding:2rem;line-height:1.8;color:#111}
      .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1e3a8a;padding-bottom:1rem;margin-bottom:1.5rem}
      .header img{height:64px}
      table{width:100%;border-collapse:collapse;margin:1.5rem 0}
      th,td{border:1px solid #ccc;padding:8px;text-align:right}
      th{background:#f1f5f9}
      .sig{margin-top:3rem;display:flex;justify-content:space-between}
      .sig-box{width:45%;border-top:1px solid #333;padding-top:8px;text-align:center}
    </style></head><body>
    <div class="header">
      <div>
        <h1 style="margin:0;color:#1e3a8a">نموذج تعهد رسمي</h1>
        <p style="margin:4px 0 0">مجمع حلقات البساتين</p>
        <p style="margin:4px 0 0;font-size:14px">التاريخ: ${todayAr()}</p>
      </div>
      <img src="/logo-light.png" alt="شعار المجمع" class="print-logo"/>
    </div>
    <p><strong>اسم الطالب:</strong> ${studentName}</p>
    <p><strong>رقم ولي الأمر:</strong> ${guardianPhone ?? "—"}</p>
    <p><strong>عدد التعهدات:</strong> ${pledgeCount}</p>
    <table>
      <thead><tr><th>التاريخ</th><th>سبب التعهد</th><th>المسجّل</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>أقرّ ولي الأمر باطلاعي على التعهدات المذكورة والالتزام بما ورد فيها.</p>
    <div class="sig">
      <div class="sig-box">توقيع ولي الأمر</div>
      <div class="sig-box">توقيع المشرف الإداري</div>
    </div>
    </body></html>`);
  w.document.close();
  w.print();
}

export function PledgesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [reportStudentId, setReportStudentId] = useState<number | null>(null);
  const [modalStudentId, setModalStudentId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [pledgeDate, setPledgeDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [report, setReport] = useState<PledgeReport | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!canUseApi()) {
      setSummaryLoading(false);
      return;
    }
    setSummaryLoading(true);
    try {
      const res = await api.adminDeptPledgesList();
      setSummaryRows(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل جدول التعهدات");
      setSummaryRows([]);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  function openAddModal() {
    setError(null);
    setModalStudentId(null);
    setReason("");
    setPledgeDate(new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  }

  async function addPledge(e: React.FormEvent) {
    e.preventDefault();
    if (!canUseApi() || modalStudentId == null || !reason.trim()) {
      setError("اختر الطالب وأدخل سبب التعهد");
      return;
    }
    setSubmitting(true);
    setError(null);
    setAlertMsg(null);
    try {
      const res = await api.adminDeptAddPledge({
        student_id: modalStudentId,
        reason_ar: reason.trim(),
        pledge_date: pledgeDate,
      });
      if (res.threshold_reached && res.alert) setAlertMsg(res.alert);
      setReason("");
      setModalOpen(false);
      setModalStudentId(null);
      await loadSummary();
      setReportStudentId(modalStudentId);
      await loadReport(modalStudentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إضافة التعهد");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadReport(sid?: number) {
    const id = sid ?? reportStudentId;
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

  async function openStudentDetail(row: SummaryRow) {
    setReportStudentId(row.student_id);
    setDetailOpen(true);
    await loadReport(row.student_id);
  }

  function printReport() {
    if (!report) return;
    const student = report.student as { full_name_ar?: string; guardian_phone?: string | null };
    printPledgeForm(
      student.full_name_ar ?? "الطالب",
      student.guardian_phone ?? null,
      report.pledges,
      report.pledge_count,
    );
  }

  function isStudentSearchTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest("[data-student-search-root]") ||
        target.closest("[data-student-search-list]"),
    );
  }

  return (
    <div className="space-y-4 max-w-[1100px]" dir="rtl">
      <div className="print:hidden flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            التعهدات والإجراءات
          </h2>
          <p className={ds.page.description} style={tajawal}>
            جدول ملخص التعهدات مع نموذج طباعة رسمي وتصعيدات المعلمين.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          className={`${ds.btnRound} shrink-0`}
          onClick={openAddModal}
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

      <Tabs defaultValue="pledges" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto flex-wrap print:hidden">
          <TabsTrigger
            value="pledges"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
            style={tajawal}
          >
            <FileText className="w-4 h-4 ml-2 inline" />
            سجل التعهدات
          </TabsTrigger>
          <TabsTrigger
            value="escalations"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
            style={tajawal}
          >
            تصعيدات المعلمين
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pledges" className="mt-4 space-y-4">
          <div className={`${ds.card} overflow-hidden print:hidden`}>
            <div className="p-4 border-b border-border">
              <h3 className={ds.page.section} style={tajawal}>
                جدول التعهدات الرئيسي
              </h3>
            </div>
            {summaryLoading ? (
              <p className="p-4 text-sm text-muted-foreground" style={tajawal}>
                جاري التحميل…
              </p>
            ) : summaryRows.length === 0 ? (
              <p className={`m-4 ${ds.alert.info}`} style={tajawal}>
                لا توجد تعهدات مسجّلة بعد.
              </p>
            ) : (
              <Table className={`${ds.tableMin} text-right`} dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${ds.table.head} w-[22%]`} style={tajawal}>
                      الاسم
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                      رقم ولي الأمر
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
                      عدد التعهدات
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[32%]`} style={tajawal}>
                      سبب التعهد
                    </TableHead>
                    <TableHead className={ds.table.headActionsWide} style={tajawal}>
                      إجراء
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryRows.map((row) => (
                    <TableRow key={row.student_id}>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.full_name_ar}
                      </TableCell>
                      <TableCell className={ds.table.cell} dir="ltr" style={tajawal}>
                        {row.guardian_phone ?? "—"}
                      </TableCell>
                      <TableCell className={`${ds.table.cell} tabular-nums`} style={tajawal}>
                        {row.pledge_count}
                      </TableCell>
                      <TableCell
                        className={`${ds.table.cell} text-muted-foreground text-sm`}
                        style={tajawal}
                      >
                        {row.latest_reason ?? "—"}
                      </TableCell>
                      <TableCell className={ds.table.actionsCellWide}>
                        <div className={ds.table.actionsWrapWide}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={ds.btnRound}
                            onClick={() => void openStudentDetail(row)}
                            style={tajawal}
                          >
                            <Eye className="w-4 h-4" />
                            عرض
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={ds.btnRound}
                            onClick={async () => {
                              setReportStudentId(row.student_id);
                              const res = await api.adminDeptPledgeReport(row.student_id);
                              printPledgeForm(
                                row.full_name_ar,
                                row.guardian_phone,
                                res.pledges,
                                res.pledge_count,
                              );
                            }}
                            style={tajawal}
                          >
                            <Printer className="w-4 h-4" />
                            طباعة
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className={`${ds.card} p-4 print:hidden space-y-3`}>
            <Label style={tajawal}>بحث سريع عن طالب</Label>
            <AdminStudentSearchCombobox
              id="pledge-report-student-search"
              value={reportStudentId}
              onChange={(id) => {
                setReportStudentId(id);
                setReport(null);
                if (id != null) void loadReport(id);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="escalations" className="mt-4">
          <div className={ds.card}>
            <div className="p-4 border-b border-border">
              <h3 className={ds.page.section} style={tajawal}>
                تصعيدات المعلمين (معلقة)
              </h3>
              <p className="text-sm text-muted-foreground mt-1" style={tajawal}>
                عرض الطلب، تعديله، قبوله كتعهد رسمي، أو حذفه.
              </p>
            </div>
            <TeacherEscalationsTab onChanged={loadSummary} />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className={ds.dialog} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>تفاصيل التعهد</DialogTitle>
          </DialogHeader>
          {report && (
            <div className="space-y-3">
              <p className="font-bold" style={tajawal}>
                {(report.student as { full_name_ar?: string }).full_name_ar ?? "الطالب"}
              </p>
              <p className="text-sm text-muted-foreground" style={tajawal}>
                عدد التعهدات: {report.pledge_count} / {report.max_pledges}
              </p>
              <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
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
              <Button
                type="button"
                variant="outline"
                className={`w-full ${ds.btnRound}`}
                onClick={printReport}
                style={tajawal}
              >
                <Printer className="w-4 h-4" />
                طباعة النموذج
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className={`${ds.dialog} z-[60]`}
          dir="rtl"
          onInteractOutside={(e) => {
            if (isStudentSearchTarget(e.target)) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (isStudentSearchTarget(e.target)) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle style={tajawal}>إضافة تعهد</DialogTitle>
            <DialogDescription style={tajawal}>
              ابحث عن الطالب بالاسم ثم أدخل سبب التعهد.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addPledge} className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>الطالب *</Label>
              <AdminStudentSearchCombobox
                id="pledge-modal-student-search"
                value={modalStudentId}
                onChange={(id) => setModalStudentId(id)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2 relative z-[1]">
              <Label htmlFor="pledge-date-input" style={tajawal}>
                تاريخ التعهد
              </Label>
              <Input
                id="pledge-date-input"
                type="date"
                value={pledgeDate}
                onChange={(e) => setPledgeDate(e.target.value)}
                disabled={submitting}
                className={ds.field}
              />
            </div>
            <div className="space-y-2 relative z-[1]">
              <Label htmlFor="pledge-reason-input" style={tajawal}>
                سبب التعهد *
              </Label>
              <Input
                id="pledge-reason-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                readOnly={false}
                disabled={submitting}
                className={ds.field}
                style={tajawal}
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              variant="default"
              className={`w-full ${ds.btnRound}`}
              disabled={submitting}
              style={tajawal}
            >
              {submitting ? "جاري الحفظ…" : "حفظ التعهد"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
