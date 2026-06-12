import { useCallback, useEffect, useMemo, useState } from "react";
import { GuardedForm } from "../../components/ui/guarded-form";
import { Archive, Plus, Search } from "lucide-react";
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
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../../components/ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type ArchiveRow = {
  id: number;
  title: string;
  type: "link" | "file";
  file_url_or_link: string;
  description: string | null;
  tags: string;
  created_at: string;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function openArchiveFile(dataUrl: string, title: string) {
  if (!dataUrl.startsWith("data:")) {
    window.open(dataUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    `<html dir="rtl"><head><title>${title}</title></head><body style="margin:0"><iframe src="${dataUrl}" style="width:100%;height:100vh;border:0"></iframe></body></html>`,
  );
}

function parseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function ProgramsArchivePage() {
  const [items, setItems] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "link" | "file">("");
  const [tagFilter, setTagFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [itemType, setItemType] = useState<"link" | "file">("link");
  const [urlOrFile, setUrlOrFile] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const row of items) {
      for (const t of parseTags(row.tags)) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ar"));
  }, [items]);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.progProgramArchivesList({
        q: q || undefined,
        type: typeFilter || undefined,
        tag: tagFilter || undefined,
      });
      setItems(res.items as ArchiveRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [q, typeFilter, tagFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setTitle("");
    setItemType("link");
    setUrlOrFile("");
    setDescription("");
    setTagsText("");
    setFormOpen(true);
  }

  async function onFilePick(file: File | null) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("الحد الأقصى 5MB. يُفضّل رفع الملف على Google Drive ولصق الرابط.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUrlOrFile(String(reader.result ?? ""));
      setItemType("file");
    };
    reader.readAsDataURL(file);
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !urlOrFile.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const tags = tagsText
        .split(/[,،]/)
        .map((t) => t.trim())
        .filter(Boolean);
      await api.progProgramArchiveCreate({
        title: title.trim(),
        type: itemType,
        file_url_or_link: urlOrFile.trim(),
        description: description.trim() || undefined,
        tags,
      });
      setFormOpen(false);
      setSuccess("تمت الإضافة للأرشيف.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    if (deleteId == null) return;
    await api.progProgramArchiveDelete(deleteId);
    setDeleteId(null);
    setSuccess("تم الحذف.");
    await load();
  }

  return (
    <div dir="rtl" className="space-y-6 max-w-[1200px] text-right">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <Archive className="w-7 h-7 text-primary" />
            أرشيف البرامج التربوية
          </h2>
          <p className={ds.page.description} style={tajawal}>
            روابط وملفات تعليمية مع أوسام للوصول السريع.
          </p>
        </div>
        <Button className={cn(ds.btnRound, "rounded-full")} onClick={openCreate} style={tajawal}>
          <Plus className="w-4 h-4" />
          إضافة للأرشيف
        </Button>
      </div>

      {error && <p className={ds.alert.error} style={tajawal}>{error}</p>}
      {success && <p className={ds.alert.success} style={tajawal}>{success}</p>}

      <div className={`${ds.card} p-4 grid gap-3 sm:grid-cols-3`}>
        <div className="relative sm:col-span-2">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className={cn(ds.field, "pr-9")}
            placeholder="بحث في العنوان أو الوصف أو الوسوم"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className={ds.select}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "" | "link" | "file")}
        >
          <option value="">كل الأنواع</option>
          <option value="link">رابط</option>
          <option value="file">ملف</option>
        </select>
        <select
          className={ds.select}
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        >
          <option value="">كل الأوسام</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((row) => {
          const tags = parseTags(row.tags);
          return (
            <div key={row.id} className={`${ds.card} p-4 flex flex-col gap-3 text-right`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold" style={tajawal}>
                    {row.title}
                  </h3>
                  <p className="text-xs text-muted-foreground" style={tajawal}>
                    {row.type === "link" ? "رابط" : "ملف"}
                  </p>
                </div>
                <TableIconAction kind="delete" onClick={() => setDeleteId(row.id)} />
              </div>
              {row.description && (
                <p className="text-sm text-muted-foreground line-clamp-2" style={tajawal}>
                  {row.description}
                </p>
              )}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-start">
                  {tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="rounded-full bg-muted px-2 py-0.5 text-xs"
                      onClick={() => setTagFilter(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="text-sm text-primary hover:underline truncate text-right"
                dir="ltr"
                onClick={() => {
                  if (row.type === "link") {
                    window.open(row.file_url_or_link, "_blank", "noopener,noreferrer");
                  } else {
                    openArchiveFile(row.file_url_or_link, row.title);
                  }
                }}
              >
                {row.type === "link" ? row.file_url_or_link : "فتح الملف"}
              </button>
            </div>
          );
        })}
      </div>

      {!loading && items.length === 0 && (
        <p className={ds.alert.info} style={tajawal}>
          لا توجد عناصر في الأرشيف.
        </p>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right")}>
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>إضافة للأرشيف</DialogTitle>
          </DialogHeader>
          <GuardedForm onSubmit={saveItem} className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>العنوان</Label>
              <Input className={ds.field} value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="flex gap-2">
              {(["link", "file"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={cn(
                    "rounded-full px-4 py-2 text-sm",
                    itemType === t
                      ? "bg-primary text-primary-foreground"
                      : "border border-border",
                  )}
                  onClick={() => setItemType(t)}
                >
                  {t === "link" ? "رابط" : "ملف"}
                </button>
              ))}
            </div>
            <p className={ds.alert.info} style={tajawal}>
              يُفضّل إضافة روابط Google Drive بدلاً من رفع ملفات كبيرة. الحد الأقصى للرفع
              المباشر 5MB.
            </p>
            {itemType === "link" ? (
              <Input
                className={ds.field}
                dir="ltr"
                placeholder="https://..."
                value={urlOrFile}
                onChange={(e) => setUrlOrFile(e.target.value)}
                required
              />
            ) : (
              <Input
                type="file"
                className={ds.field}
                onChange={(e) => void onFilePick(e.target.files?.[0] ?? null)}
              />
            )}
            <div className="space-y-2">
              <Label style={tajawal}>الوصف</Label>
              <Input className={ds.field} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>الأوسام (مفصولة بفاصلة)</Label>
              <Input className={ds.field} value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
            </div>
            <DialogFooter className="flex-row-reverse gap-2">
              <Button type="submit" disabled={saving} className={cn(ds.btnRound, "rounded-full")}>
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
        title="حذف من الأرشيف"
        description="هل تريد حذف هذا العنصر نهائياً؟"
        confirmLabel="حذف"
        destructive
        onConfirm={deleteItem}
      />
    </div>
  );
}
