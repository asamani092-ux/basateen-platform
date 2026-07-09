import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { api, type AdminTrackRow, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type LinkRow = {
  id: number;
  group_type: "circle" | "track";
  group_label: string;
  public_path: string;
  is_active: number;
  evergreen?: boolean;
};

type EntityType = "circle" | "track";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEntityType?: EntityType;
  defaultCircleId?: number;
  defaultCircleName?: string;
  defaultTrackId?: number;
  defaultTrackName?: string;
  circles?: CircleOption[];
  tracks?: AdminTrackRow[];
};

function shortenPath(path: string, max = 28): string {
  if (path.length <= max) return path;
  return `…${path.slice(-max + 1)}`;
}

export function AttendanceMagicLinksModal({
  open,
  onOpenChange,
  defaultEntityType = "circle",
  defaultCircleId,
  defaultCircleName,
  defaultTrackId,
  defaultTrackName,
  circles = [],
  tracks = [],
}: Props) {
  const [items, setItems] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [createType, setCreateType] = useState<EntityType>(defaultEntityType);
  const [createCircleId, setCreateCircleId] = useState(
    defaultCircleId != null ? String(defaultCircleId) : "",
  );
  const [createTrackId, setCreateTrackId] = useState(
    defaultTrackId != null ? String(defaultTrackId) : "",
  );

  useEffect(() => {
    if (open) {
      setCreateType(defaultEntityType);
      setCreateCircleId(
        defaultCircleId != null ? String(defaultCircleId) : "",
      );
      setCreateTrackId(defaultTrackId != null ? String(defaultTrackId) : "");
    }
  }, [open, defaultEntityType, defaultCircleId, defaultTrackId]);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptMagicLinksList();
      setItems(
        res.items.map((r) => ({
          id: r.id,
          group_type: r.group_type ?? (r.track_id ? "track" : "circle"),
          group_label:
            r.group_type === "track" || r.track_id
              ? (r.track_name ?? "مسار")
              : (r.circle_name ?? "حلقة"),
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

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      if (createType === "circle") {
        const cid = Number(createCircleId);
        if (!Number.isFinite(cid)) {
          setError("اختر الحلقة");
          return;
        }
        await api.adminDeptCreateMagicLink({
          group_type: "circle",
          circle_id: cid,
          feature_name: "student_attendance",
        });
        const name =
          circles.find((c) => c.id === cid)?.name_ar ??
          defaultCircleName ??
          "الحلقة";
        setCopyHint(`تم إنشاء رابط لحلقة ${name}`);
      } else {
        const tid = Number(createTrackId);
        if (!Number.isFinite(tid)) {
          setError("اختر المسار");
          return;
        }
        await api.adminDeptCreateMagicLink({
          group_type: "track",
          track_id: tid,
          feature_name: "student_attendance",
        });
        const name =
          tracks.find((t) => t.id === tid)?.name_ar ??
          defaultTrackName ??
          "المسار";
        setCopyHint(`تم إنشاء رابط لمسار ${name}`);
      }
      await load();
      setTimeout(() => setCopyHint(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إنشاء الرابط");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (deleteId == null) return;
    setDeletingId(deleteId);
    try {
      await api.adminDeptMagicLinksDelete(deleteId);
      toast.success("تم حذف رابط التحضير");
      setDeleteId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل حذف رابط التحضير");
      throw e;
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={tajawal}>إدارة روابط التحضير 🔗</DialogTitle>
            <DialogDescription style={tajawal}>
              الرابط مرتبط بحلقة أو مسار — كل فتح يعرض تحضير يوم اليوم تلقائياً.
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

          <div className={`${ds.card} p-4 space-y-4`}>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={createType === "circle" ? "default" : "outline"}
                className={ds.btnRound}
                onClick={() => setCreateType("circle")}
                style={tajawal}
              >
                رابط حلقة
              </Button>
              <Button
                type="button"
                variant={createType === "track" ? "default" : "outline"}
                className={ds.btnRound}
                onClick={() => setCreateType("track")}
                style={tajawal}
              >
                رابط مسار
              </Button>
            </div>

            {createType === "circle" ? (
              <div className="space-y-2">
                <Label style={tajawal}>الحلقة</Label>
                <Select value={createCircleId} onValueChange={setCreateCircleId}>
                  <SelectTrigger className={ds.btnRound}>
                    <SelectValue placeholder="اختر الحلقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {circles.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label style={tajawal}>المسار</Label>
                <Select value={createTrackId} onValueChange={setCreateTrackId}>
                  <SelectTrigger className={ds.btnRound}>
                    <SelectValue placeholder="اختر المسار" />
                  </SelectTrigger>
                  <SelectContent>
                    {tracks.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              type="button"
              className={`${ds.btnRound} w-full sm:w-auto`}
              disabled={busy}
              onClick={createLink}
              style={tajawal}
            >
              {busy ? "جاري التوليد…" : "توليد رابط جديد"}
            </Button>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm" style={tajawal}>
              جاري التحميل…
            </p>
          ) : items.length === 0 ? (
            <p className={ds.alert.info} style={tajawal}>
              لا توجد روابط — أنشئ رابطاً لحلقة أو مسار.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className={ds.tableMin}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={ds.table.head} style={tajawal}>
                      النوع
                    </TableHead>
                    <TableHead className={ds.table.head} style={tajawal}>
                      الكيان
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
                        {row.group_type === "track" ? "مسار" : "حلقة"}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.group_label}
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
                        {deletingId === row.id ? (
                          <span
                            className="inline-flex size-8 items-center justify-center"
                            aria-label="جاري الحذف"
                          >
                            <Loader2 className="size-4 animate-spin text-destructive" />
                          </span>
                        ) : (
                          <TableIconAction
                            kind="delete"
                            onClick={() => setDeleteId(row.id)}
                            disabled={deletingId != null || busy}
                          />
                        )}
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
