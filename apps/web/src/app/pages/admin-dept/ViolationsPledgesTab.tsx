import { useCallback, useEffect, useState } from "react";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Card,
  CardContent,
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
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { stageLabel } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";

type Row = {
  id: number;
  full_name_ar: string;
  stage_id: number | null;
  notice_count: number;
  escalation_level: string;
  pledge_archived: number;
  account_status: string;
};

const ESC_LABELS: Record<string, string> = {
  none: "—",
  notice_1: "إشعار أول",
  notice_2: "إشعار ثاني",
  summons: "استدعاء ولي الأمر",
};

export function ViolationsPledgesTab() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [printId, setPrintId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    studentId: number;
    act: "archive_pledge" | "suspend" | "dismiss" | "transfer";
    label: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!getApiToken()) return;
    setLoading(true);
    try {
      const res = await api.gsDisciplinary();
      setItems(res.items as Row[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function recordViolation(studentId: number) {
    const desc = window.prompt("وصف المخالفة (اختياري):") ?? "";
    setBusyId(studentId);
    try {
      await api.gsDisciplinaryViolation(studentId, desc || undefined);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function requestAction(
    studentId: number,
    act: "archive_pledge" | "suspend" | "dismiss" | "transfer",
    label: string,
  ) {
    setPendingAction({ studentId, act, label });
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const { studentId, act } = pendingAction;
    setPendingAction(null);
    setBusyId(studentId);
    try {
      await api.gsDisciplinaryAction(studentId, act);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function openPrint(row: Row) {
    setPrintId(row.id);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
      <meta charset="utf-8"/><title>نموذج إجرائي</title>
      <style>body{font-family:Tajawal,sans-serif;padding:2rem;line-height:1.8}
      h1{color:#1e3a8a}</style></head><body>
      <h1>مجمع حلقات البساتين — نموذج إجرائي</h1>
      <p><strong>الطالب:</strong> ${row.full_name_ar}</p>
      <p><strong>المرحلة:</strong> ${stageLabel(row.stage_id)}</p>
      <p><strong>مستوى التصعيد:</strong> ${ESC_LABELS[row.escalation_level] ?? row.escalation_level}</p>
      <p><strong>عدد الإشعارات:</strong> ${row.notice_count}</p>
      <hr/>
      <p>أقرّ ولي الأمر باطلاعي على المخالفة والإجراء المتخذ.</p>
      <p>التوقيع: _________________ &nbsp;&nbsp; التاريخ: _________________</p>
      </body></html>`);
    w.document.close();
    w.print();
    setPrintId(null);
  }

  return (
    <Card className={ds.card}>
      <CardHeader>
        <CardTitle style={tajawal}>التعهدات والضبط الانضباطي</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`${ds.alert.info} mb-4`} style={tajawal}>
          التصعيد التلقائي: إشعار أول ← إشعار ثاني ← استدعاء ولي الأمر
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className={ds.tableMin}>
              <TableHeader>
                <TableRow>
                  <TableHead className={`${ds.table.head} w-[24%]`} style={tajawal}>
                    الطالب
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[16%]`} style={tajawal}>
                    المرحلة
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[20%]`} style={tajawal}>
                    التصعيد
                  </TableHead>
                  <TableHead className={ds.table.headActionsWide} style={tajawal}>
                    إجراءات
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className={ds.table.cell} style={tajawal}>
                      {row.full_name_ar}
                    </TableCell>
                    <TableCell className={ds.table.cell} style={tajawal}>
                      {stageLabel(row.stage_id)}
                    </TableCell>
                    <TableCell className={ds.table.cell} style={tajawal}>
                      {ESC_LABELS[row.escalation_level] ?? row.escalation_level}
                      {row.notice_count > 0 ? ` (${row.notice_count})` : ""}
                    </TableCell>
                    <TableActionsCell wide>
                      <TableIconAction
                        kind="violation"
                        disabled={busyId === row.id}
                        onClick={() => recordViolation(row.id)}
                      />
                      <TableIconAction
                        kind="archive"
                        disabled={busyId === row.id}
                        onClick={() =>
                          requestAction(row.id, "archive_pledge", "أرشفة التعهد")
                        }
                      />
                      <TableIconAction
                        kind="suspend"
                        disabled={busyId === row.id}
                        onClick={() =>
                          requestAction(row.id, "suspend", "تعليق الحساب")
                        }
                      />
                      <TableIconAction
                        kind="dismiss"
                        disabled={busyId === row.id}
                        onClick={() =>
                          requestAction(row.id, "dismiss", "فصل الطالب")
                        }
                      />
                      <TableIconAction
                        kind="transfer"
                        disabled={busyId === row.id}
                        onClick={() =>
                          requestAction(row.id, "transfer", "نقل الطالب")
                        }
                      />
                      <TableIconAction
                        kind="print"
                        disabled={printId === row.id}
                        onClick={() => openPrint(row)}
                      />
                    </TableActionsCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog
        open={pendingAction != null}
        onOpenChange={(o) => {
          if (!o) setPendingAction(null);
        }}
      >
        <DialogContent className={`${ds.dialog} sm:max-w-sm`} dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>تأكيد الإجراء</DialogTitle>
            <DialogDescription style={tajawal}>
              {pendingAction?.label} — هل تريد المتابعة؟
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              style={tajawal}
              onClick={() => setPendingAction(null)}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              className={ds.btnRound}
              style={tajawal}
              onClick={() => void confirmPendingAction()}
            >
              تأكيد
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
