import { useCallback, useEffect, useState } from "react";
import { MonitorPlay, Plus } from "lucide-react";
import { TableIconAction } from "../../components/admin/TableIconAction";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Switch } from "../../components/ui/switch";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../../components/ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type MediaRow = {
  id: number;
  media_type: string;
  media_url: string;
  display_order: number;
  is_active: number;
};

const MAX_MEDIA = 500_000;

export function DisplayManagerPage() {
  const [items, setItems] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [slideSeconds, setSlideSeconds] = useState(12);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [mediaType, setMediaType] = useState<"image" | "gif" | "video">("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [res, settings] = await Promise.all([
        api.displayMediaList(),
        api.displaySettingsGet().catch(() => ({ slide_seconds: 12 })),
      ]);
      setItems(res.items);
      setSlideSeconds(settings.slide_seconds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setMediaType("image");
    setMediaUrl("");
    setFormOpen(true);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_MEDIA) {
      setError("الملف أكبر من الحد المسموح.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setMediaUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
    if (file.type.includes("gif")) setMediaType("gif");
    else if (file.type.startsWith("video/")) setMediaType("video");
    else setMediaType("image");
  }

  async function saveMedia(e: React.FormEvent) {
    e.preventDefault();
    if (!mediaUrl.trim()) return;
    setSaving(true);
    try {
      await api.displayMediaCreate({ media_type: mediaType, media_url: mediaUrl.trim() });
      setFormOpen(false);
      setSuccess("تمت إضافة الوسائط.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: MediaRow) {
    await api.displayMediaPatch(row.id, { is_active: row.is_active ? 0 : 1 });
    await load();
  }

  async function move(row: MediaRow, dir: -1 | 1) {
    const sorted = [...items].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((x) => x.id === row.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    const order = sorted.map((x) => x.id);
    [order[idx], order[idx + dir]] = [order[idx + dir], order[idx]];
    await api.displayMediaReorder(order);
    await load();
  }

  async function deleteMedia() {
    if (deleteId == null) return;
    await api.displayMediaDelete(deleteId);
    setDeleteId(null);
    setSuccess("تم الحذف.");
    await load();
  }

  return (
    <div dir="rtl" className="space-y-6 max-w-[1100px] text-right">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <MonitorPlay className="w-7 h-7 text-primary" />
            إدارة شاشات العرض
          </h2>
          <p className={ds.page.description} style={tajawal}>
            رفع وترتيب الوسائط المعروضة على الشاشة العامة الحية.
          </p>
        </div>
        <Button className={cn(ds.btnRound, "rounded-full")} onClick={openCreate} style={tajawal}>
          <Plus className="w-4 h-4" />
          وسائط جديدة
        </Button>
      </div>

      {error && <p className={ds.alert.error} style={tajawal}>{error}</p>}
      {success && <p className={ds.alert.success} style={tajawal}>{success}</p>}

      <div className={`${ds.card} overflow-x-auto`}>
        <Table className={ds.tableMin}>
          <TableHeader>
            <TableRow>
              <TableHead className={ds.table.head} style={tajawal}>الترتيب</TableHead>
              <TableHead className={ds.table.head} style={tajawal}>النوع</TableHead>
              <TableHead className={ds.table.head} style={tajawal}>معاينة</TableHead>
              <TableHead className={ds.table.head} style={tajawal}>نشط</TableHead>
              <TableHead className={ds.table.headActionsWide} style={tajawal}>إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...items]
              .sort((a, b) => a.display_order - b.display_order)
              .map((row) => (
                <TableRow key={row.id}>
                  <TableCell className={ds.table.cell}>{row.display_order}</TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {row.media_type === "video" ? "فيديو" : row.media_type === "gif" ? "GIF" : "صورة"}
                  </TableCell>
                  <TableCell className={ds.table.cell}>
                    {row.media_type === "video" ? (
                      <video src={row.media_url} className="h-14 w-24 object-cover rounded-lg" muted />
                    ) : (
                      <img src={row.media_url} alt="" className="h-14 w-24 object-cover rounded-lg" />
                    )}
                  </TableCell>
                  <TableCell className={ds.table.cell}>
                    <Switch checked={row.is_active === 1} onCheckedChange={() => void toggleActive(row)} />
                  </TableCell>
                  <TableCell className={ds.table.actionsCellWide}>
                    <div className={ds.table.actionsWrapWide}>
                      <Button type="button" size="sm" variant="outline" onClick={() => void move(row, -1)}>
                        ↑
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void move(row, 1)}>
                        ↓
                      </Button>
                      <TableIconAction kind="delete" onClick={() => setDeleteId(row.id)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!loading && items.length === 0 && (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            لا توجد وسائط — أضف صوراً أو فيديوهات للعرض.
          </p>
        )}
      </div>

      <div className={`${ds.card} p-4 flex flex-col sm:flex-row sm:items-end gap-3 text-right`} dir="rtl">
        <div className="space-y-2 flex-1">
          <Label style={tajawal}>مدة عرض كل شريحة (ثوانٍ)</Label>
          <Input
            type="number"
            min={3}
            max={120}
            className={cn(ds.field, "max-w-[140px]")}
            value={slideSeconds}
            onChange={(e) => setSlideSeconds(Number(e.target.value) || 12)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className={cn(ds.btnRound, "rounded-full")}
          onClick={() =>
            void api.displaySettingsPatch({ slide_seconds: slideSeconds }).then(() =>
              setSuccess("تم حفظ إعدادات العرض."),
            )
          }
        >
          حفظ الإعداد
        </Button>
      </div>

      <p className="text-sm text-muted-foreground" style={tajawal}>
        معاينة الشاشة الحية:{" "}
        <a href="/public/live-display" target="_blank" rel="noopener noreferrer" className="text-primary underline">
          /public/live-display
        </a>
      </p>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right")}>
          <DialogHeader>
            <DialogTitle style={tajawal}>وسائط جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveMedia} className="space-y-4">
            <div className="flex gap-2">
              {(["image", "gif", "video"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={cn(
                    "rounded-full px-3 py-1 text-sm",
                    mediaType === t ? "bg-primary text-primary-foreground" : "border border-border",
                  )}
                  onClick={() => setMediaType(t)}
                >
                  {t === "image" ? "صورة" : t === "gif" ? "GIF" : "فيديو"}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>رابط أو رفع ملف</Label>
              <Input
                className={ds.field}
                dir="ltr"
                placeholder="https://..."
                value={mediaUrl.startsWith("data:") ? "" : mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
              />
              <Input type="file" accept="image/*,video/*" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
            </div>
            <DialogFooter className="flex-row-reverse gap-2">
              <Button type="submit" disabled={saving || !mediaUrl.trim()} className={cn(ds.btnRound, "rounded-full")}>
                حفظ
              </Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DoubleConfirmDialog
        open={deleteId != null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="حذف الوسائط"
        description="إزالة هذه الوسائط من الشاشة العامة؟"
        confirmLabel="حذف"
        destructive
        onConfirm={deleteMedia}
      />
    </div>
  );
}
