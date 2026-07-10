import { useCallback, useEffect, useState } from "react";
import { GuardedForm } from "../../components/ui/guarded-form";
import { BarChart3, MonitorPlay, Plus, Trophy } from "lucide-react";
import { TableIconAction } from "../../components/admin/TableIconAction";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { PageLoader } from "../../components/shared/PageLoader";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
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

type SlideType = "media" | "kpi" | "competition";

type MediaRow = {
  id: number;
  slide_type: SlideType;
  media_type: string;
  media_url: string;
  competition_id: number | null;
  duration_seconds: number;
  display_order: number;
  is_active: number;
};

type CompetitionOption = { id: number; name_ar: string };

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function slideTypeLabel(t: SlideType): string {
  if (t === "kpi") return "مؤشرات المجمع";
  if (t === "competition") return "منافسة";
  return "وسائط";
}

export function DisplayManagerPage() {
  const [items, setItems] = useState<MediaRow[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [slideSeconds, setSlideSeconds] = useState(12);
  const [indicatorsEnabled, setIndicatorsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formSlideType, setFormSlideType] = useState<SlideType>("media");
  const [mediaType, setMediaType] = useState<"image" | "gif" | "video">("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [formDuration, setFormDuration] = useState(12);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [res, settings, comps] = await Promise.all([
        api.displayMediaList(),
        api.displaySettingsGet().catch(() => ({ slide_seconds: 12, indicators_enabled: true })),
        api.displayCompetitionsList().catch(() => ({ items: [] })),
      ]);
      setItems(
        res.items.map((r) => ({
          ...r,
          slide_type: (r.slide_type ?? "media") as SlideType,
          competition_id: r.competition_id ?? null,
          duration_seconds: r.duration_seconds ?? settings.slide_seconds,
        })),
      );
      setSlideSeconds(settings.slide_seconds);
      setIndicatorsEnabled(settings.indicators_enabled ?? true);
      setCompetitions(
        (comps.items as CompetitionOption[]).map((c) => ({
          id: Number(c.id),
          name_ar: String(c.name_ar),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate(type: SlideType) {
    setFormSlideType(type);
    setMediaType("image");
    setMediaUrl("");
    setCompetitionId("");
    setFormDuration(slideSeconds);
    setFormOpen(true);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("الملف أكبر من 100 ميجابايت.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.displayMediaUpload(file);
      setMediaUrl(res.url);
      setMediaType(res.media_type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل رفع الملف");
    } finally {
      setSaving(false);
    }
  }

  async function saveSlide(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (formSlideType === "media" && !mediaUrl.trim()) {
        setError("الرجاء إرفاق وسائط.");
        return;
      }
      if (formSlideType === "competition" && !competitionId) {
        setError("اختر منافسة.");
        return;
      }
      await api.displayMediaCreate({
        slide_type: formSlideType,
        media_type: mediaType,
        media_url: formSlideType === "media" ? mediaUrl.trim() : "-",
        competition_id: formSlideType === "competition" ? Number(competitionId) : undefined,
        duration_seconds: formDuration,
      });
      setFormOpen(false);
      setSuccess("تمت إضافة الشريحة.");
      await load();
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "drive_video_not_supported") {
        setError(
          e.message ||
            "لا يمكن تشغيل فيديو من رابط Google Drive — يُرجى رفع ملف الفيديو مباشرة.",
        );
      } else if (e.code === "data_url_rejected") {
        setError(e.message || "يُمنع تخزين الوسائط كـ base64.");
      } else {
        setError(e.message || "فشل الحفظ");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: MediaRow) {
    await api.displayMediaPatch(row.id, { is_active: row.is_active ? 0 : 1 });
    await load();
  }

  async function updateDuration(row: MediaRow, sec: number) {
    const clamped = Math.min(120, Math.max(3, sec || slideSeconds));
    await api.displayMediaPatch(row.id, { duration_seconds: clamped });
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

  async function saveSettings() {
    await api.displaySettingsPatch({
      slide_seconds: slideSeconds,
      indicators_enabled: indicatorsEnabled,
    });
    setSuccess("تم حفظ إعدادات العرض.");
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
            ترتيب شرائح العرض: وسائط، مؤشرات المجمع، أو منافسة محددة.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className={cn(ds.btnRound, "rounded-full")}
            onClick={() => openCreate("media")}
            style={tajawal}
          >
            <Plus className="w-4 h-4" />
            وسائط
          </Button>
          <Button
            variant="outline"
            className={cn(ds.btnRound, "rounded-full")}
            onClick={() => openCreate("kpi")}
            style={tajawal}
          >
            <BarChart3 className="w-4 h-4" />
            مؤشرات
          </Button>
          <Button
            variant="outline"
            className={cn(ds.btnRound, "rounded-full")}
            onClick={() => openCreate("competition")}
            style={tajawal}
          >
            <Trophy className="w-4 h-4" />
            منافسة
          </Button>
        </div>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}
      {success && (
        <p className={ds.alert.success} style={tajawal}>
          {success}
        </p>
      )}

      <div className={`${ds.card} overflow-x-auto`}>
        {loading ? (
          <PageLoader inline label="جاري تحميل شرائح العرض…" />
        ) : (
          <Table className={ds.tableMin}>
            <TableHeader>
              <TableRow>
                <TableHead className={ds.table.head} style={tajawal}>
                  الترتيب
                </TableHead>
                <TableHead className={ds.table.head} style={tajawal}>
                  النوع
                </TableHead>
                <TableHead className={ds.table.head} style={tajawal}>
                  التفاصيل
                </TableHead>
                <TableHead className={ds.table.head} style={tajawal}>
                  المدة (ث)
                </TableHead>
                <TableHead className={ds.table.head} style={tajawal}>
                  نشط
                </TableHead>
                <TableHead className={ds.table.headActionsWide} style={tajawal}>
                  إجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...items]
                .sort((a, b) => a.display_order - b.display_order)
                .map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className={ds.table.cell}>{row.display_order}</TableCell>
                    <TableCell className={ds.table.cell} style={tajawal}>
                      {slideTypeLabel(row.slide_type)}
                    </TableCell>
                    <TableCell className={ds.table.cell}>
                      {row.slide_type === "media" ? (
                        row.media_type === "video" ? (
                          <video
                            src={row.media_url}
                            className="h-14 w-24 object-cover rounded-lg"
                            muted
                          />
                        ) : row.media_url.startsWith("http") || row.media_url.startsWith("data:") ? (
                          <img
                            src={row.media_url}
                            alt=""
                            className="h-14 w-24 object-cover rounded-lg"
                          />
                        ) : (
                          <span style={tajawal}>
                            {row.media_type === "video" ? "فيديو" : row.media_type === "gif" ? "GIF" : "صورة"}
                          </span>
                        )
                      ) : row.slide_type === "kpi" ? (
                        <span className="text-muted-foreground" style={tajawal}>
                          مؤشرات تعليمية + حضور
                        </span>
                      ) : (
                        <span style={tajawal}>
                          {competitions.find((c) => c.id === row.competition_id)?.name_ar ??
                            `منافسة #${row.competition_id ?? "—"}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={ds.table.cell}>
                      <Input
                        type="number"
                        min={3}
                        max={120}
                        className={cn(ds.field, "w-20 h-9")}
                        value={row.duration_seconds}
                        onChange={(e) =>
                          void updateDuration(row, Number(e.target.value) || slideSeconds)
                        }
                      />
                    </TableCell>
                    <TableCell className={ds.table.cell}>
                      <Switch
                        checked={row.is_active === 1}
                        onCheckedChange={() => void toggleActive(row)}
                      />
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
        )}
        {!loading && items.length === 0 && (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            لا توجد شرائح — أضف وسائط أو مؤشرات أو منافسة للعرض.
          </p>
        )}
      </div>

      <div className={`${ds.card} p-4 space-y-4 text-right`} dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={indicatorsEnabled}
              onCheckedChange={(v) => setIndicatorsEnabled(v)}
            />
            <Label style={tajawal}>عرض شرائح المؤشرات (KPI والمنافسات)</Label>
          </div>
          <p className="text-sm text-muted-foreground" style={tajawal}>
            عند الإيقاف تُعرض وسائط الوسائط فقط في الدوران.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-2 flex-1">
            <Label style={tajawal}>المدة الافتراضية لكل شريحة (ثوانٍ)</Label>
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
            onClick={() => void saveSettings()}
          >
            حفظ الإعداد
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground" style={tajawal}>
        معاينة الشاشة الحية:{" "}
        <a
          href="/public/live-display"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          /public/live-display
        </a>
      </p>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right")}>
          <DialogHeader>
            <DialogTitle style={tajawal}>
              {formSlideType === "media"
                ? "وسائط جديدة"
                : formSlideType === "kpi"
                  ? "شريحة مؤشرات المجمع"
                  : "شريحة منافسة"}
            </DialogTitle>
          </DialogHeader>
          <GuardedForm onSubmit={saveSlide} className="space-y-4">
            {formSlideType === "media" && (
              <>
                <div className="flex gap-2">
                  {(["image", "gif", "video"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={cn(
                        "rounded-full px-3 py-1 text-sm",
                        mediaType === t
                          ? "bg-primary text-primary-foreground"
                          : "border border-border",
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
                  <Input
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground" style={tajawal}>
                    صور Google Drive: الصق رابط المشاركة. الفيديو: ارفع الملف مباشرة (لا يُقبل رابط Drive).
                  </p>
                </div>
              </>
            )}

            {formSlideType === "competition" && (
              <div className="space-y-2">
                <Label style={tajawal}>المنافسة</Label>
                <Select value={competitionId} onValueChange={setCompetitionId}>
                  <SelectTrigger className={ds.select}>
                    <SelectValue placeholder="اختر منافسة" />
                  </SelectTrigger>
                  <SelectContent>
                    {competitions.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formSlideType === "kpi" && (
              <p className={`${ds.alert.info} text-sm`} style={tajawal}>
                تعرض مؤشرات المجمع: حضور، أوجه تراكمية، حلقات، مسارات، وطلاب حسب المرحلة.
              </p>
            )}

            <div className="space-y-2">
              <Label style={tajawal}>مدة العرض (ثوانٍ) — يُتجاهل للفيديو حتى النهاية</Label>
              <Input
                type="number"
                min={3}
                max={120}
                className={cn(ds.field, "max-w-[140px]")}
                value={formDuration}
                onChange={(e) => setFormDuration(Number(e.target.value) || slideSeconds)}
              />
            </div>

            <DialogFooter className="flex-row-reverse gap-2">
              <Button
                type="submit"
                disabled={
                  saving ||
                  (formSlideType === "media" && !mediaUrl.trim()) ||
                  (formSlideType === "competition" && !competitionId)
                }
                className={cn(ds.btnRound, "rounded-full")}
              >
                حفظ
              </Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </GuardedForm>
        </DialogContent>
      </Dialog>

      <DoubleConfirmDialog
        open={deleteId != null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="حذف الشريحة"
        description="إزالة هذه الشريحة من الشاشة العامة؟"
        confirmLabel="حذف"
        destructive
        onConfirm={deleteMedia}
      />
    </div>
  );
}
