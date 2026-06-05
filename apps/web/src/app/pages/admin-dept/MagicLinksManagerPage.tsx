import { useCallback, useEffect, useState } from "react";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
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

type AttendanceLinkRow = {
  id: number;
  circle_name: string | null;
  public_path: string;
  is_active: number;
  attendance_date: string | null;
};

function shortenPath(path: string, max = 28): string {
  if (path.length <= max) return path;
  return `…${path.slice(-max + 1)}`;
}

export function MagicLinksManagerPage() {
  const [items, setItems] = useState<AttendanceLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptMagicLinksList();
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل روابط التحضير");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function fullUrl(publicPath: string) {
    if (typeof window === "undefined") return publicPath;
    return `${window.location.origin}${publicPath}`;
  }

  async function copyLink(publicPath: string) {
    try {
      await navigator.clipboard.writeText(fullUrl(publicPath));
      setCopyHint("تم نسخ الرابط");
      setTimeout(() => setCopyHint(null), 2000);
    } catch {
      setCopyHint("تعذر النسخ");
    }
  }

  async function confirmDelete() {
    if (deleteId == null) return;
    await api.adminDeptMagicLinksDelete(deleteId);
    setDeleteId(null);
    await load();
  }

  return (
    <div className="space-y-4 max-w-[1100px]">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          روابط التحضير
        </h2>
        <p className={ds.page.description} style={tajawal}>
          إدارة روابط تحضير الطلاب للحلقات — انسخ الرابط أو احذفه نهائياً.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}
      {copyHint && (
        <p className={ds.alert.success} style={tajawal}>
          {copyHint}
        </p>
      )}

      <Card className={ds.card}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={tajawal}>
            روابط التحضير النشطة
          </CardTitle>
          <CardDescription style={tajawal}>
            مرّر المؤشر على الأيقونات لمعرفة الإجراء.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-muted-foreground text-right" style={tajawal}>
              جاري التحميل…
            </p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-right" style={tajawal}>
              لا توجد روابط تحضير مسجّلة بعد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className={ds.tableMin}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${ds.table.head} w-[24%]`} style={tajawal}>
                      الحلقة
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                      التاريخ
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[38%]`} style={tajawal}>
                      الرابط
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
                      الحالة
                    </TableHead>
                    <TableHead className={ds.table.headActions} style={tajawal}>
                      إجراءات
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => {
                    const url = fullUrl(row.public_path);
                    return (
                      <TableRow key={row.id}>
                        <TableTruncatedCell className="font-medium" style={tajawal}>
                          {row.circle_name ?? "—"}
                        </TableTruncatedCell>
                        <TableCell
                          className={`${ds.table.cell} whitespace-nowrap`}
                          style={tajawal}
                        >
                          {row.attendance_date ?? "—"}
                        </TableCell>
                        <TableTruncatedCell
                          className="font-mono text-muted-foreground max-w-[320px]"
                          style={{ direction: "ltr" }}
                          title={url}
                        >
                          {shortenPath(row.public_path, 32)}
                        </TableTruncatedCell>
                        <TableCell className={ds.table.cell}>
                          <Badge
                            variant={row.is_active ? "secondary" : "destructive"}
                            className="text-xs"
                          >
                            {row.is_active ? "مفعّل" : "مغلق"}
                          </Badge>
                        </TableCell>
                        <TableActionsCell>
                          <TableIconAction
                            kind="copy"
                            onClick={() => copyLink(row.public_path)}
                          />
                          <TableIconAction
                            kind="delete"
                            onClick={() => setDeleteId(row.id)}
                          />
                        </TableActionsCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DoubleConfirmDialog
        open={deleteId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title="حذف رابط التحضير"
        description="سيتم حذف الرابط نهائياً ولن يعمل بعد الآن."
        confirmLabel="حذف نهائي"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
