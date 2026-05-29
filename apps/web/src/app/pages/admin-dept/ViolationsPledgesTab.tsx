import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
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

  async function action(
    studentId: number,
    act: "archive_pledge" | "suspend" | "dismiss" | "transfer",
  ) {
    if (!window.confirm("تأكيد الإجراء؟")) return;
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
                  <TableHead style={tajawal}>الطالب</TableHead>
                  <TableHead style={tajawal}>المرحلة</TableHead>
                  <TableHead style={tajawal}>التصعيد</TableHead>
                  <TableHead style={tajawal}>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell style={tajawal}>{row.full_name_ar}</TableCell>
                    <TableCell style={tajawal}>
                      {stageLabel(row.stage_id)}
                    </TableCell>
                    <TableCell style={tajawal}>
                      {ESC_LABELS[row.escalation_level] ?? row.escalation_level}
                      {row.notice_count > 0 ? ` (${row.notice_count})` : ""}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className={ds.btnRound}
                          disabled={busyId === row.id}
                          onClick={() => recordViolation(row.id)}
                          style={tajawal}
                        >
                          تسجيل مخالفة
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={ds.btnRound}
                          disabled={busyId === row.id}
                          onClick={() => action(row.id, "archive_pledge")}
                          style={tajawal}
                        >
                          أرشفة التعهد
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={ds.btnRound}
                          disabled={busyId === row.id}
                          onClick={() => action(row.id, "suspend")}
                          style={tajawal}
                        >
                          تعليق
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className={ds.btnRound}
                          disabled={busyId === row.id}
                          onClick={() => action(row.id, "dismiss")}
                          style={tajawal}
                        >
                          فصل
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={ds.btnRound}
                          disabled={busyId === row.id}
                          onClick={() => action(row.id, "transfer")}
                          style={tajawal}
                        >
                          نقل
                        </Button>
                        <Button
                          size="sm"
                          className={ds.btnRound}
                          disabled={printId === row.id}
                          onClick={() => openPrint(row)}
                          style={tajawal}
                        >
                          طباعة النموذج
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
