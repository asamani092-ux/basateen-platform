import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Calendar, Plus, Trophy } from "lucide-react";
import { Button } from "../../components/ui/button";
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
              <Link
                key={c.id}
                to={`/edu-dept/competitions/${c.id}`}
                className={`${ds.card} p-5 block hover:border-primary/40 transition-colors`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-lg" style={tajawal}>
                    {c.name_ar}
                  </h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusClass(c.status)}`}
                    style={tajawal}
                  >
                    {isCurrent && c.status === "active" ? "حالية" : statusLabel(c.status)}
                  </span>
                </div>
                <p className="text-xs text-primary/80 mb-2" style={tajawal}>
                  {categoryLabel(c.category, c.custom_category)}
                </p>
                {c.description ? (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3" style={tajawal}>
                    {c.description}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground flex items-center gap-1" style={tajawal}>
                  <Calendar className="w-3.5 h-3.5" />
                  {c.start_date} → {c.end_date}
                </p>
              </Link>
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
    </div>
  );
}
