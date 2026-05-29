import { useCallback, useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { cn } from "../../components/ui/utils";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
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
          إدارة روابط التحضير
        </h2>
        <p className={ds.page.description} style={tajawal}>
          روابط تحضير الطلاب المصدرة للحلقات — نسخ أو حذف نهائي.
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
            انقر «نسخ» للحصول على الرابط الكامل.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
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
              <Table className="w-full min-w-[640px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-[20%]" style={tajawal}>
                      الحلقة
                    </TableHead>
                    <TableHead className="text-right w-[12%]" style={tajawal}>
                      التاريخ
                    </TableHead>
                    <TableHead className="text-right w-[28%]" style={tajawal}>
                      الرابط
                    </TableHead>
                    <TableHead className="text-right w-[12%]" style={tajawal}>
                      الحالة
                    </TableHead>
                    <TableHead className="text-right w-[28%]" style={tajawal}>
                      إجراءات
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => {
                    const url = fullUrl(row.public_path);
                    return (
                      <TableRow key={row.id}>
                        <TableCell
                          className="text-right font-medium align-middle truncate"
                          style={tajawal}
                          title={row.circle_name ?? undefined}
                        >
                          {row.circle_name ?? "—"}
                        </TableCell>
                        <TableCell
                          className="text-right align-middle whitespace-nowrap"
                          style={tajawal}
                        >
                          {row.attendance_date ?? "—"}
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          <span
                            className="text-xs text-muted-foreground font-mono block truncate"
                            dir="ltr"
                            title={url}
                          >
                            {shortenPath(row.public_path, 32)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          <Badge
                            variant={row.is_active ? "secondary" : "destructive"}
                            className="text-xs"
                          >
                            {row.is_active ? "مفعّل" : "مغلق"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          <div className="flex flex-wrap gap-1 justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn("h-7 px-2 text-xs", ds.btnRound)}
                              onClick={() => copyLink(row.public_path)}
                              style={tajawal}
                            >
                              <Copy className="w-3.5 h-3.5" />
                              نسخ
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className={cn("h-7 px-2 text-xs", ds.btnRound)}
                              onClick={() => setDeleteId(row.id)}
                              style={tajawal}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              حذف
                            </Button>
                          </div>
                        </TableCell>
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
