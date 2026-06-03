import { useCallback, useEffect, useState } from "react";
import { DoubleConfirmDialog } from "../shared/DoubleConfirmDialog";
import {
  TableActionsCell,
  TableIconAction,
} from "../admin/TableIconAction";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type LinkRow = {
  id: number;
  circle_name: string | null;
  public_path: string;
  is_active: number;
  evergreen?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** عند التوفير: زر إنشاء رابط لهذه الحلقة */
  defaultCircleId?: number;
  defaultCircleName?: string;
};

function shortenPath(path: string, max = 28): string {
  if (path.length <= max) return path;
  return `…${path.slice(-max + 1)}`;
}

export function AttendanceMagicLinksModal({
  open,
  onOpenChange,
  defaultCircleId,
  defaultCircleName,
}: Props) {
  const [items, setItems] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptMagicLinksList();
      setItems(
        res.items.map((r) => ({
          id: r.id,
          circle_name: r.circle_name,
          public_path: r.public_path,
          is_active: r.is_active,
          evergreen: r.evergreen,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الروابط");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

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

  async function toggleLink(id: number) {
    setBusy(true);
    try {
      await api.adminDeptToggleMagicLink(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تعليق الرابط");
    } finally {
      setBusy(false);
    }
  }

  async function createForCircle() {
    const cid = defaultCircleId;
    if (cid == null || !Number.isFinite(cid)) {
      setError("اختر الحلقة في صفحة التحضير أولاً");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminDeptCreateMagicLink({
        circle_id: cid,
        feature_name: "student_attendance",
      });
      await load();
      setCopyHint(`تم إنشاء رابط لـ ${defaultCircleName ?? "الحلقة"}`);
      setTimeout(() => setCopyHint(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إنشاء الرابط");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (deleteId == null) return;
    await api.adminDeptMagicLinksDelete(deleteId);
    setDeleteId(null);
    await load();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={tajawal}>إدارة روابط التحضير 🔗</DialogTitle>
            <DialogDescription style={tajawal}>
              الرابط مرتبط بالحلقة فقط — كل فتح يعرض تحضير يوم اليوم تلقائياً.
            </DialogDescription>
          </DialogHeader>

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

          {defaultCircleId != null && (
            <Button
              type="button"
              className={`${ds.btnRound} w-full sm:w-auto`}
              disabled={busy}
              onClick={createForCircle}
              style={tajawal}
            >
              {busy ? "جاري التوليد…" : `توليد رابط لـ ${defaultCircleName ?? "الحلقة المختارة"}`}
            </Button>
          )}

          {loading ? (
            <p className="text-muted-foreground text-sm" style={tajawal}>
              جاري التحميل…
            </p>
          ) : items.length === 0 ? (
            <p className={ds.alert.info} style={tajawal}>
              لا توجد روابط نشطة — أنشئ رابطاً من الحلقة المختارة.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className={ds.tableMin}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={ds.table.head} style={tajawal}>
                      الحلقة
                    </TableHead>
                    <TableHead className={ds.table.head} style={tajawal}>
                      النوع
                    </TableHead>
                    <TableHead className={ds.table.head} style={tajawal}>
                      الرابط
                    </TableHead>
                    <TableHead className={ds.table.head} style={tajawal}>
                      الحالة
                    </TableHead>
                    <TableHead className={ds.table.headActions} style={tajawal}>
                      إجراءات
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.circle_name ?? "—"}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.evergreen ? "يومي (دائم)" : "—"}
                      </TableCell>
                      <TableCell className={ds.table.cell}>
                        <span
                          className="text-xs text-muted-foreground font-mono block truncate"
                          dir="ltr"
                          title={fullUrl(row.public_path)}
                        >
                          {shortenPath(row.public_path, 36)}
                        </span>
                      </TableCell>
                      <TableCell className={ds.table.cell}>
                        <Badge
                          variant={row.is_active === 1 ? "secondary" : "destructive"}
                        >
                          {row.is_active === 1 ? "نشط" : "موقوف"}
                        </Badge>
                      </TableCell>
                      <TableActionsCell>
                        <TableIconAction
                          kind="copy"
                          onClick={() => copyLink(row.public_path)}
                        />
                        <TableIconAction
                          kind="freeze"
                          label={row.is_active === 1 ? "تعليق" : "تفعيل"}
                          onClick={() => toggleLink(row.id)}
                          disabled={busy}
                        />
                        <TableIconAction
                          kind="delete"
                          onClick={() => setDeleteId(row.id)}
                        />
                      </TableActionsCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
    </>
  );
}
