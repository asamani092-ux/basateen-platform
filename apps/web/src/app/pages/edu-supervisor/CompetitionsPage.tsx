import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Calendar, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { CompetitionCreateForm } from "../../components/edu/CompetitionCreateForm";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { categoryLabel } from "../../lib/competition-engine";
import { ds, tajawal } from "../../lib/design-system";

type CompetitionRow = {
  id: number;
  name_ar: string;
  description?: string;
  start_date: string;
  end_date: string;
  status: string;
  category?: string;
  custom_category?: string;
};

function statusLabel(status: string): string {
  if (status === "active") return "جارية";
  if (status === "closed") return "منتهية";
  return "مسودة";
}

function statusClass(status: string): string {
  if (status === "active") return "bg-emerald-500/15 text-emerald-700";
  if (status === "closed") return "bg-muted text-muted-foreground";
  return "bg-amber-500/15 text-amber-700";
}

export function CompetitionsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CompetitionRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    try {
      const res = await api.competitionsList();
      setItems(res.items as CompetitionRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    setError(null);
    try {
      await api.competitionsDelete(deleteId);
      setItems((prev) => prev.filter((c) => c.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setDeleting(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 max-w-[1600px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <Trophy className="w-7 h-7 text-primary" />
            المنافسات
          </h2>
          <p className={ds.page.description} style={tajawal}>
            محرك منافسات ديناميكي — أنشئ منافسة واستهدف الطلاب في نموذج موحّد.
          </p>
        </div>
        <Button
          type="button"
          className={ds.btnRound}
          onClick={() => setCreateOpen(true)}
          style={tajawal}
        >
          <Plus className="w-4 h-4" />
          إنشاء منافسة جديدة
        </Button>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className={`${ds.card} p-12 text-center text-muted-foreground`} style={tajawal}>
          لا توجد منافسات بعد. أنشئ أول منافسة للبدء.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => {
            const isCurrent = c.start_date <= today && c.end_date >= today;
            return (
              <div
                key={c.id}
                className={`${ds.card} p-5 flex flex-col hover:border-primary/40 transition-colors`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link
                    to={`/edu-dept/competitions/${c.id}`}
                    className="font-semibold text-lg hover:text-primary flex-1 min-w-0"
                    style={tajawal}
                  >
                    {c.name_ar}
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${statusClass(c.status)}`}
                      style={tajawal}
                    >
                      {isCurrent && c.status === "active" ? "حالية" : statusLabel(c.status)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="تعديل"
                      onClick={() => navigate(`/edu-dept/competitions/${c.id}`)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="حذف"
                      onClick={() => setDeleteId(c.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Link to={`/edu-dept/competitions/${c.id}`} className="flex-1 block">
                  <p className="text-xs text-primary/80 mb-2" style={tajawal}>
                    {categoryLabel(c.category, c.custom_category)}
                  </p>
                  {c.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3" style={tajawal}>
                      {c.description}
                    </p>
                  ) : null}
                  <p
                    className="text-xs text-muted-foreground flex items-center gap-1"
                    style={tajawal}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {c.start_date} → {c.end_date}
                  </p>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={`${ds.card} max-w-2xl rounded-2xl`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>إنشاء منافسة جديدة</DialogTitle>
          </DialogHeader>
          <CompetitionCreateForm
            onCancel={() => setCreateOpen(false)}
            onCreated={async (id) => {
              setCreateOpen(false);
              await load();
              navigate(`/edu-dept/competitions/${id}`);
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle style={tajawal}>حذف المنافسة؟</AlertDialogTitle>
            <AlertDialogDescription style={tajawal}>
              سيتم حذف المنافسة وجميع المستهدفين والمهام وسجلات الرصد المرتبطة بها. لا
              يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={deleting} style={tajawal}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              style={tajawal}
            >
              {deleting ? "جاري الحذف…" : "حذف نهائي"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
