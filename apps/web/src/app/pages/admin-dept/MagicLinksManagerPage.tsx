import { useCallback, useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
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

type MagicLinkRow = {
  id: number;
  circle_name: string | null;
  public_path: string;
  is_active: number;
  attendance_date: string | null;
};

export function MagicLinksManagerPage() {
  const [items, setItems] = useState<MagicLinkRow[]>([]);
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
      setError(e instanceof Error ? e.message : "فشل تحميل الروابط");
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
    <div className="space-y-4 max-w-[1200px]">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          إدارة الروابط السحرية
        </h2>
        <p className={ds.page.description} style={tajawal}>
          جميع روابط تحضير الطلاب المصدرة للحلقات — نسخ أو حذف نهائي.
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

      <div className={`${ds.card} overflow-hidden`}>
        {loading ? (
          <p className="p-4 text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground" style={tajawal}>
            لا توجد روابط سحرية مسجّلة بعد.
          </p>
        ) : (
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right w-[22%]" style={tajawal}>
                  الحلقة
                </TableHead>
                <TableHead className="text-right w-[14%]" style={tajawal}>
                  التاريخ
                </TableHead>
                <TableHead className="text-right w-[34%]" style={tajawal}>
                  الرابط
                </TableHead>
                <TableHead className="text-right w-[12%]" style={tajawal}>
                  الحالة
                </TableHead>
                <TableHead className="text-right w-[18%]" style={tajawal}>
                  إجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-right font-medium" style={tajawal}>
                    {row.circle_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right" style={tajawal}>
                    {row.attendance_date ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <code className="text-xs break-all" dir="ltr">
                      {fullUrl(row.public_path)}
                    </code>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={row.is_active ? "secondary" : "destructive"}>
                      {row.is_active ? "مفعّل" : "مغلق"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={ds.btnRound}
                        onClick={() => copyLink(row.public_path)}
                      >
                        <Copy className="w-4 h-4" />
                        نسخ
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className={ds.btnRound}
                        onClick={() => setDeleteId(row.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                        حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <DoubleConfirmDialog
        open={deleteId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title="حذف الرابط السحري"
        description="سيتم حذف الرابط نهائياً ولن يعمل بعد الآن."
        confirmLabel="حذف نهائي"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
