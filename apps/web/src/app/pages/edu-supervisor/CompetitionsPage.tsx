import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Calendar, Plus, Trophy } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type CompetitionRow = {
  id: number;
  name_ar: string;
  description?: string;
  start_date: string;
  end_date: string;
  status: string;
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
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);
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

  async function createCompetition() {
    if (!nameAr.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await api.competitionsCreate({
        name_ar: nameAr.trim(),
        description: description.trim(),
        start_date: startDate,
        end_date: endDate,
      });
      setCreateOpen(false);
      setNameAr("");
      setDescription("");
      await load();
      if (res.id) navigate(`/edu-dept/competitions/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإنشاء");
    } finally {
      setCreating(false);
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
            محرك منافسات ديناميكي — أنشئ أي فعالية بأي اسم مع أدوات موحّدة لكل منافسة.
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
        <DialogContent className={`${ds.card} max-w-md rounded-2xl`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>إنشاء منافسة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>اسم المنافسة</Label>
              <Input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className={ds.btnRound}
                placeholder="مثال: مسابقة الحفظ الشهرية"
              />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>الوصف</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={ds.btnRound}
                placeholder="وصف مختصر للفعالية"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label style={tajawal}>تاريخ البداية</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={ds.btnRound}
                />
              </div>
              <div className="space-y-2">
                <Label style={tajawal}>تاريخ النهاية</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={ds.btnRound}
                />
              </div>
            </div>
            <Button
              type="button"
              className={`w-full ${ds.btnRound}`}
              disabled={!nameAr.trim() || creating}
              onClick={() => void createCompetition()}
              style={tajawal}
            >
              {creating ? "جاري الإنشاء…" : "إنشاء المنافسة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
