import { useEffect, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type TargetKey = string;

export function CompetitionWizard() {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [circles, setCircles] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [tracks, setTracks] = useState<Array<{ id: number; name: string }>>([]);
  const [selected, setSelected] = useState<Set<TargetKey>>(new Set());

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const grid = await api.eduMatrixMasterGrid();
        setCircles(grid.circles.map((c) => ({ id: c.id, name: c.name })));
        setTracks(grid.tracks.map((t) => ({ id: t.id, name: t.name })));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذّر تحميل الأهداف");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(key: TargetKey, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("اسم المنافسة مطلوب");
      return;
    }
    const targets: Array<{
      target_type: "circle" | "track";
      target_id: number;
    }> = [];
    for (const key of selected) {
      const [type, id] = key.split(":");
      if (type === "circle" || type === "track") {
        targets.push({ target_type: type, target_id: Number(id) });
      }
    }
    setBusy(true);
    try {
      const res = await api.eduMatrixCompetitionCreate({
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        targets,
      });
      toast.success(`تم إنشاء المنافسة #${res.id}`);
      setName("");
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الإنشاء");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2" style={tajawal}>
          <Trophy className="size-5 text-primary" />
          منافسة زمنية (معزولة عن الرصد الفصلي)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label style={tajawal}>اسم المنافسة</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label style={tajawal}>تاريخ البداية</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label style={tajawal}>تاريخ النهاية</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium" style={tajawal}>
            أهداف المنافسة (حلقات / مسارات)
          </p>
          <div className="grid sm:grid-cols-2 gap-4 max-h-64 overflow-y-auto border rounded-lg p-3">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">حلقات</p>
              {circles.map((c) => {
                const key = `circle:${c.id}`;
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm"
                    style={tajawal}
                  >
                    <Checkbox
                      checked={selected.has(key)}
                      onCheckedChange={(v) => toggle(key, v === true)}
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">مسارات</p>
              {tracks.map((t) => {
                const key = `track:${t.id}`;
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm"
                    style={tajawal}
                  >
                    <Checkbox
                      checked={selected.has(key)}
                      onCheckedChange={(v) => toggle(key, v === true)}
                    />
                    {t.name}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <Button
          type="button"
          className={ds.btnRound}
          disabled={busy}
          onClick={() => void handleCreate()}
        >
          {busy ? "جاري الإنشاء…" : "إنشاء المنافسة"}
        </Button>
      </CardContent>
    </Card>
  );
}
