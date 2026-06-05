import { useCallback, useEffect, useState } from "react";
import { Bell, Plus, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import { TableRowActionsMenu } from "../../components/shared/TableRowActionsMenu";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
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
  latest_pledge_id: number | null;
  latest_pledge_date: string | null;
};

type PledgeReport = Awaited<ReturnType<typeof api.adminDeptPledgeReport>>;

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
  const printDate = new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
    <meta charset="utf-8"/><title>نموذج تعهد</title>
    <style>
      body{font-family:Tajawal,sans-serif;padding:2rem;line-height:1.8;color:#111;background:#fff}
      .print-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem}
      .print-top .complex{font-weight:700;font-size:1.125rem}
      .print-top .date{font-size:0.875rem}
      .print-title{text-align:center;font-weight:700;font-size:1.25rem;margin:0.75rem 0}
      .print-hr{border:none;border-top:2px solid #000;margin:1rem 0}
      table{width:100%;border-collapse:collapse;margin:1.5rem 0}
      th,td{border:1px solid #ccc;padding:8px;text-align:right}
      th{background:#f1f5f9}
      .pledge-sig{margin-top:3rem;text-align:right;font-weight:700}
    </style></head><body>
    <div class="print-top">
      <p class="complex">مجمع حلقات البساتين</p>
      <p class="date">${printDate}</p>
    </div>
    <h2 class="print-title">تعهد طالب</h2>
    <hr class="print-hr"/>
    <p><strong>اسم الطالب:</strong> ${studentName}</p>
    <p><strong>رقم ولي الأمر:</strong> ${guardianPhone?.trim() ? guardianPhone : "—"}</p>
    <p><strong>عدد التعهدات:</strong> ${pledgeCount}</p>
    <table>
      <thead><tr><th>التاريخ</th><th>سبب التعهد</th><th>المسجّل</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>الإجراء: ........................................................</p>
    <div class="pledge-sig">توقيع ولي الأمر: ........................</div>
    </body></html>`);
  w.document.close();
  w.print();
}

export function PledgesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [escalationsOpen, setEscalationsOpen] = useState(false);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
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
  const [editPledge, setEditPledge] = useState<{
    id: number;
    reason_ar: string;
    pledge_date: string;
  } | null>(null);
  const [deletePledge, setDeletePledge] = useState<{
    id: number;
    reason_ar: string;
  } | null>(null);
  const [deleteAllStudent, setDeleteAllStudent] = useState<SummaryRow | null>(null);
  const [pledgeBusy, setPledgeBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const loadSummary = useCallback(async () => {
    if (!canUseApi()) {
      setSummaryLoading(false);
      return;
    }
    setSummaryLoading(true);
    try {
      const res = await api.adminDeptPledgesList(
        debouncedQ ? { q: debouncedQ } : undefined,
      );
      setSummaryRows(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل جدول التعهدات");
      setSummaryRows([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [debouncedQ]);

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
      const msg = err instanceof Error ? err.message : "فشل إضافة التعهد";
      setError(
        msg === "student_not_found"
          ? "الطالب غير موجود أو غير نشط — أعد تحميل الصفحة وحاول مجدداً"
          : msg,
      );
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

  async function printStudentPledges(row: SummaryRow) {
    const res = await api.adminDeptPledgeReport(row.student_id);
    const student = res.student as {
      full_name_ar?: string;
      guardian_phone?: string | null;
    };
    printPledgeForm(
      student.full_name_ar ?? row.full_name_ar,
      student.guardian_phone ?? row.guardian_phone,
      res.pledges,
      res.pledge_count,
    );
  }

  async function savePledgeEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editPledge || !canUseApi()) return;
    setPledgeBusy(true);
    try {
      await api.adminDeptPatchPledge(editPledge.id, {
        reason_ar: editPledge.reason_ar.trim(),
        pledge_date: editPledge.pledge_date,
      });
      toast.success("تم تحديث التعهد");
      setEditPledge(null);
      await loadSummary();
      if (reportStudentId != null) await loadReport(reportStudentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحديث");
    } finally {
      setPledgeBusy(false);
    }
  }

  async function confirmDeletePledge() {
    if (!deletePledge || !canUseApi()) return;
    setPledgeBusy(true);
    try {
      const res = await api.adminDeptDeletePledge(deletePledge.id);
      toast.success("تم حذف التعهد");
      setDeletePledge(null);
      await loadSummary();
      if (res.pledge_count === 0) {
        setDetailOpen(false);
        setReport(null);
      } else if (reportStudentId != null) {
        await loadReport(reportStudentId);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
    } finally {
      setPledgeBusy(false);
    }
  }

  async function confirmDeleteAllPledges() {
    if (!deleteAllStudent || !canUseApi()) return;
    setPledgeBusy(true);
    try {
      const res = await api.adminDeptDeleteAllStudentPledges(deleteAllStudent.student_id);
      toast.success(
        `تم حذف ${res.deleted} تعهد(ات) للطالب ${deleteAllStudent.full_name_ar}`,
      );
      setDeleteAllStudent(null);
      setDetailOpen(false);
      setReport(null);
      setReportStudentId(null);
      await loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حذف التعهدات");
    } finally {
      setPledgeBusy(false);
    }
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
    <div
      className="space-y-4 max-w-[1100px] print:bg-white print:text-black print:dark:bg-white print:dark:text-black"
      dir="rtl"
    >
      <div className="print:hidden flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-right">
          <h2 className={ds.page.title} style={tajawal}>
            التعهدات والإجراءات
          </h2>
          <p className={ds.page.description} style={tajawal}>
            سجل التعهدات الرئيسي — إدارة التعهدات وتصعيدات المعلمين.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            className={`${ds.btnRound} gap-2`}
            onClick={() => setEscalationsOpen(true)}
            style={tajawal}
          >
            <Bell className="w-4 h-4" />
            تصعيد المعلمين 🔔
          </Button>
          <Button
            type="button"
            variant="default"
            className={`${ds.btnRound} gap-2`}
            onClick={openAddModal}
            style={tajawal}
          >
            <Plus className="w-4 h-4" />
            إضافة تعهد
          </Button>
        </div>
      </div>

      {error && (
        <p className={`${ds.alert.error} print:hidden text-right`} style={tajawal}>
          {error}
        </p>
      )}
      {alertMsg && (
        <p className={`${ds.alert.error} print:hidden text-right`} style={tajawal}>
          {alertMsg}
        </p>
      )}

      <div className={`${ds.card} print:hidden`}>
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-right">
              <h3 className={ds.page.section} style={tajawal}>
                سجل التعهدات
              </h3>
              <p className="text-sm text-muted-foreground mt-1" style={tajawal}>
                {debouncedQ
                  ? "نتائج البحث من قاعدة البيانات"
                  : "الحالات الحرجة (3+ تعهدات) ثم أحدث السجلات — 20 كحد أقصى"}
              </p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="بحث بالاسم أو الهوية…"
                className={`pr-9 text-right ${ds.btnRound}`}
                style={tajawal}
                dir="rtl"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
        {summaryLoading ? (
          <p className="p-4 text-sm text-muted-foreground text-right" style={tajawal}>
            جاري التحميل…
          </p>
        ) : summaryRows.length === 0 ? (
          <p className={`m-4 ${ds.alert.info} text-right`} style={tajawal}>
            {debouncedQ ? "لا توجد نتائج مطابقة." : "لا توجد تعهدات مسجّلة بعد."}
          </p>
        ) : (
          <div className={`${ds.tableWrap} overflow-visible`}>
            <Table className={ds.tableMin} dir="rtl">
              <TableHeader className="print:table-header-group">
                <TableRow className="print:break-inside-avoid">
                  <TableHead className={`${ds.table.head} ${ds.table.colName} text-right`} style={tajawal}>
                    اسم الطالب
                  </TableHead>
                  <TableHead className={`${ds.table.head} ${ds.table.colPhone} text-right`} style={tajawal}>
                    رقم ولي الأمر
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[10%] text-right`} style={tajawal}>
                    عدد التعهدات
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[24%] max-w-[280px] text-right`} style={tajawal}>
                    سبب التعهد
                  </TableHead>
                  <TableHead className={`${ds.table.headActions} text-right`} style={tajawal}>
                    الإجراءات
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryRows.map((row) => (
                  <TableRow key={row.student_id} className="print:break-inside-avoid">
                    <TableTruncatedCell className={`${ds.table.colName} text-right`} style={tajawal}>
                      {row.full_name_ar}
                    </TableTruncatedCell>
                    <TableTruncatedCell
                      className={ds.table.colPhone}
                      style={{ ...tajawal, direction: "ltr", textAlign: "right" }}
                    >
                      {row.guardian_phone ?? "—"}
                    </TableTruncatedCell>
                    <TableCell className={`${ds.table.cell} tabular-nums text-right`} style={tajawal}>
                      {row.pledge_count}
                    </TableCell>
                    <TableTruncatedCell
                      className="text-muted-foreground max-w-[280px] text-right"
                      style={tajawal}
                    >
                      {row.latest_reason ?? "—"}
                    </TableTruncatedCell>
                    <TableCell className={`${ds.table.cell} w-[56px] text-right relative overflow-visible`}>
                      <TableRowActionsMenu
                        items={[
                          {
                            id: "detail",
                            label: "عرض التفاصيل والتعديل",
                            onClick: () => void openStudentDetail(row),
                          },
                          {
                            id: "print",
                            label: "طباعة",
                            icon: <Printer className="w-4 h-4" />,
                            onClick: () => void printStudentPledges(row),
                          },
                          {
                            id: "delete-all",
                            label: "حذف كل تعهدات الطالب",
                            icon: <Trash2 className="w-4 h-4" />,
                            destructive: true,
                            onClick: () => setDeleteAllStudent(row),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={escalationsOpen} onOpenChange={setEscalationsOpen}>
        <DialogContent className={`${ds.dialog} max-w-3xl max-h-[90vh] overflow-y-auto`} dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>تصعيد المعلمين</DialogTitle>
            <DialogDescription style={tajawal}>
              عرض الطلب، تعديله، قبوله كتعهد رسمي، أو حذفه.
            </DialogDescription>
          </DialogHeader>
          <TeacherEscalationsTab onChanged={loadSummary} />
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className={ds.dialog} dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>عرض التفاصيل والتعديل</DialogTitle>
            <DialogDescription style={tajawal}>
              كل تعهد له زر حذف مستقل — اختر التعهد المراد حذفه بدقة.
            </DialogDescription>
          </DialogHeader>
          {report && (
            <div className="space-y-3 text-right">
              <p className="font-bold" style={tajawal}>
                {(report.student as { full_name_ar?: string }).full_name_ar ?? "الطالب"}
              </p>
              <p className="text-sm text-muted-foreground" style={tajawal}>
                عدد التعهدات: {report.pledge_count} / {report.max_pledges}
              </p>
              <Table className={ds.tableMin} dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${ds.table.head} w-[14%] text-right`} style={tajawal}>
                      التاريخ
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[36%] max-w-[320px] text-right`} style={tajawal}>
                      السبب
                    </TableHead>
                    <TableHead className={`${ds.table.head} ${ds.table.colName} text-right`} style={tajawal}>
                      المسجّل
                    </TableHead>
                    <TableHead className={`${ds.table.headActions} text-right`} style={tajawal}>
                      إجراءات
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.pledges.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell
                        className={`${ds.table.cell} whitespace-nowrap text-right`}
                        style={tajawal}
                      >
                        {p.pledge_date}
                      </TableCell>
                      <TableTruncatedCell className="max-w-[320px] text-right" style={tajawal}>
                        {p.reason_ar}
                      </TableTruncatedCell>
                      <TableTruncatedCell className="text-muted-foreground text-right" style={tajawal}>
                        {p.created_by_name ?? "—"}
                      </TableTruncatedCell>
                      <TableActionsCell>
                        <TableIconAction
                          kind="edit"
                          onClick={() =>
                            setEditPledge({
                              id: p.id,
                              reason_ar: p.reason_ar,
                              pledge_date: p.pledge_date,
                            })
                          }
                        />
                        <TableIconAction
                          kind="delete"
                          label="حذف 🗑️"
                          onClick={() =>
                            setDeletePledge({ id: p.id, reason_ar: p.reason_ar })
                          }
                        />
                      </TableActionsCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

      <Dialog open={editPledge != null} onOpenChange={(o) => !o && setEditPledge(null)}>
        <DialogContent className={ds.dialog} dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>تعديل التعهد</DialogTitle>
            <DialogDescription style={tajawal}>
              عدّل سبب التعهد أو تاريخه
            </DialogDescription>
          </DialogHeader>
          {editPledge && (
            <form onSubmit={savePledgeEdit} className="space-y-4 text-right">
              <div className="space-y-2">
                <Label htmlFor="edit-pledge-date" style={tajawal}>
                  تاريخ التعهد
                </Label>
                <Input
                  id="edit-pledge-date"
                  type="date"
                  value={editPledge.pledge_date}
                  onChange={(e) =>
                    setEditPledge({ ...editPledge, pledge_date: e.target.value })
                  }
                  disabled={pledgeBusy}
                  className={ds.field}
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-pledge-reason" style={tajawal}>
                  سبب التعهد *
                </Label>
                <Input
                  id="edit-pledge-reason"
                  value={editPledge.reason_ar}
                  onChange={(e) =>
                    setEditPledge({ ...editPledge, reason_ar: e.target.value })
                  }
                  required
                  disabled={pledgeBusy}
                  className={`${ds.field} text-right`}
                  style={tajawal}
                  dir="rtl"
                />
              </div>
              <Button
                type="submit"
                className={`w-full ${ds.btnRound}`}
                disabled={pledgeBusy}
                style={tajawal}
              >
                {pledgeBusy ? "جاري الحفظ…" : "حفظ التعديل"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <DoubleConfirmDialog
        open={deletePledge != null}
        onOpenChange={(o) => !o && setDeletePledge(null)}
        title="حذف التعهد"
        description={`هل تريد حذف التعهد: «${deletePledge?.reason_ar ?? ""}»؟ لا يمكن التراجع.`}
        confirmLabel="حذف"
        destructive
        onConfirm={confirmDeletePledge}
      />

      <DoubleConfirmDialog
        open={deleteAllStudent != null}
        onOpenChange={(o) => !o && setDeleteAllStudent(null)}
        title="حذف كل تعهدات الطالب"
        description={
          deleteAllStudent
            ? `هل تريد حذف جميع تعهدات «${deleteAllStudent.full_name_ar}» (${deleteAllStudent.pledge_count} تعهد)؟ سيتم تصفير العداد في قاعدة البيانات. لا يمكن التراجع.`
            : ""
        }
        confirmLabel="حذف الكل"
        destructive
        onConfirm={confirmDeleteAllPledges}
      />

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
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>إضافة تعهد</DialogTitle>
            <DialogDescription style={tajawal}>
              ابحث عن الطالب بالاسم ثم أدخل سبب التعهد.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addPledge} className="space-y-4 text-right">
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
                dir="rtl"
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
                disabled={submitting}
                className={`${ds.field} text-right`}
                style={tajawal}
                dir="rtl"
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
