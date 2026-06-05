import { useCallback, useEffect, useState } from "react";
import { Eye, FileText, MoreHorizontal, Plus, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { TableIconAction } from "../../components/admin/TableIconAction";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
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

      <Tabs defaultValue="pledges" className="w-full space-y-4">
        <TabsList
          className={`${ds.card} w-full justify-start gap-1 p-1 h-auto flex-wrap print:hidden bg-muted/40`}
        >
          <TabsTrigger
            value="pledges"
            className="flex-1 sm:flex-none data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2.5 rounded-lg"
            style={tajawal}
          >
            <FileText className="w-4 h-4 ml-2 inline" />
            سجل التعهدات
          </TabsTrigger>
          <TabsTrigger
            value="escalations"
            className="flex-1 sm:flex-none data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2.5 rounded-lg"
            style={tajawal}
          >
            تصعيد المعلمين
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pledges" className="mt-0 space-y-4">
          <div className={`${ds.card} overflow-hidden print:hidden`}>
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className={ds.page.section} style={tajawal}>
                    جدول التعهدات الرئيسي
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
                    className={`pr-9 ${ds.btnRound}`}
                    style={tajawal}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
            {summaryLoading ? (
              <p className="p-4 text-sm text-muted-foreground" style={tajawal}>
                جاري التحميل…
              </p>
            ) : summaryRows.length === 0 ? (
              <p className={`m-4 ${ds.alert.info}`} style={tajawal}>
                {debouncedQ ? "لا توجد نتائج مطابقة." : "لا توجد تعهدات مسجّلة بعد."}
              </p>
            ) : (
              <div className={ds.tableWrap}>
                <Table className={ds.tableMin} dir="rtl">
                  <TableHeader className="print:table-header-group">
                    <TableRow className="print:break-inside-avoid">
                      <TableHead className={`${ds.table.head} ${ds.table.colName}`} style={tajawal}>
                        اسم الطالب
                      </TableHead>
                      <TableHead className={`${ds.table.head} ${ds.table.colPhone}`} style={tajawal}>
                        رقم ولي الأمر
                      </TableHead>
                      <TableHead className={`${ds.table.head} w-[10%]`} style={tajawal}>
                        عدد التعهدات
                      </TableHead>
                      <TableHead className={`${ds.table.head} w-[24%] max-w-[280px]`} style={tajawal}>
                        سبب التعهد
                      </TableHead>
                      <TableHead className={ds.table.headActions} style={tajawal}>
                        الإجراءات
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryRows.map((row) => (
                      <TableRow key={row.student_id} className="print:break-inside-avoid">
                        <TableTruncatedCell className={ds.table.colName} style={tajawal}>
                          {row.full_name_ar}
                        </TableTruncatedCell>
                        <TableTruncatedCell
                          className={ds.table.colPhone}
                          style={{ ...tajawal, direction: "ltr" }}
                        >
                          {row.guardian_phone ?? "—"}
                        </TableTruncatedCell>
                        <TableCell className={`${ds.table.cell} tabular-nums`} style={tajawal}>
                          {row.pledge_count}
                        </TableCell>
                        <TableTruncatedCell
                          className="text-muted-foreground max-w-[280px]"
                          style={tajawal}
                        >
                          {row.latest_reason ?? "—"}
                        </TableTruncatedCell>
                        <TableCell className={`${ds.table.cell} w-[56px]`}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={ds.btnRound}
                                aria-label="إجراءات"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[10rem]">
                              <DropdownMenuItem
                                style={tajawal}
                                onClick={() => void openStudentDetail(row)}
                              >
                                <Eye className="w-4 h-4 ml-2" />
                                عرض السجل
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                style={tajawal}
                                onClick={async () => {
                                  setReportStudentId(row.student_id);
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
                                }}
                              >
                                <Printer className="w-4 h-4 ml-2" />
                                طباعة
                              </DropdownMenuItem>
                              {row.latest_pledge_id != null ? (
                                <>
                                  <DropdownMenuItem
                                    style={tajawal}
                                    onClick={() =>
                                      setEditPledge({
                                        id: row.latest_pledge_id!,
                                        reason_ar: row.latest_reason ?? "",
                                        pledge_date:
                                          row.latest_pledge_date ??
                                          new Date().toISOString().slice(0, 10),
                                      })
                                    }
                                  >
                                    تعديل
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    style={tajawal}
                                    onClick={() =>
                                      setDeletePledge({
                                        id: row.latest_pledge_id!,
                                        reason_ar: row.latest_reason ?? "آخر تعهد",
                                      })
                                    }
                                  >
                                    حذف
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="escalations" className="mt-0">
          <div className={`${ds.card} overflow-hidden`}>
            <div className="p-4 border-b border-border">
              <h3 className={ds.page.section} style={tajawal}>
                تصعيد المعلمين
              </h3>
              <p className="text-sm text-muted-foreground mt-1" style={tajawal}>
                عرض الطلب، تعديله، قبوله كتعهد رسمي، أو حذفه.
              </p>
            </div>
            <div className="p-4">
              <TeacherEscalationsTab onChanged={loadSummary} />
            </div>
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
              <Table className={ds.tableMin} dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                      التاريخ
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[36%] max-w-[320px]`} style={tajawal}>
                      السبب
                    </TableHead>
                    <TableHead className={`${ds.table.head} ${ds.table.colName}`} style={tajawal}>
                      المسجّل
                    </TableHead>
                    <TableHead className={ds.table.headActions} style={tajawal}>
                      إجراءات
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.pledges.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell
                        className={`${ds.table.cell} whitespace-nowrap`}
                        style={tajawal}
                      >
                        {p.pledge_date}
                      </TableCell>
                      <TableTruncatedCell
                        className="max-w-[320px]"
                        style={tajawal}
                      >
                        {p.reason_ar}
                      </TableTruncatedCell>
                      <TableTruncatedCell
                        className="text-muted-foreground"
                        style={tajawal}
                      >
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
          <DialogHeader>
            <DialogTitle style={tajawal}>تعديل التعهد</DialogTitle>
            <DialogDescription style={tajawal}>
              عدّل سبب التعهد أو تاريخه
            </DialogDescription>
          </DialogHeader>
          {editPledge && (
            <form onSubmit={savePledgeEdit} className="space-y-4">
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
                  className={ds.field}
                  style={tajawal}
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
