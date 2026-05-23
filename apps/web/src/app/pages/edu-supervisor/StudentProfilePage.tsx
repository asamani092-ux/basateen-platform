import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { stageLabel } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";

type Targets = {
  hifz_pages?: number;
  muraja_pages?: number;
  sama_minutes?: number;
  daily_notes?: string;
};

export function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const id = Number(studentId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState<number | null>(null);
  const [circleName, setCircleName] = useState<string | null>(null);
  const [targets, setTargets] = useState<Targets>({});
  const [notes, setNotes] = useState("");
  const [marks, setMarks] = useState<Array<Record<string, unknown>>>([]);
  const [compSummary, setCompSummary] = useState<Array<Record<string, unknown>>>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canUseApi() || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduStudentProfile(id);
      const st = res.student as Record<string, unknown>;
      setName(String(st.full_name_ar ?? ""));
      setStageId(st.stage_id != null ? Number(st.stage_id) : null);
      const cur = res.current as { circle_name?: string } | null;
      setCircleName(cur?.circle_name ?? null);
      const plan = res.edu_plan as { targets?: Targets; notes?: string | null };
      setTargets((plan.targets as Targets) ?? {});
      setNotes(String(plan.notes ?? ""));
      setMarks(res.teacher_marks as Array<Record<string, unknown>>);
      setCompSummary(res.competitions_summary as Array<Record<string, unknown>>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function savePlan() {
    setSaving(true);
    try {
      await api.eduStudentPlanPatch(id, { targets, notes });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="text-muted-foreground" style={tajawal}>
        جاري التحميل…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
          <Link to="/edu-supervisor/students">← الطلاب</Link>
        </Button>
        <h2 className={ds.page.title} style={tajawal}>
          {name}
        </h2>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <p className="text-sm text-muted-foreground" style={tajawal}>
        {stageLabel(stageId)} · {circleName ?? "غير مسكّن"}
      </p>

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>الخطة التعليمية (مشرف تعليمي)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="حفظ (صفحات/يوم)"
            value={targets.hifz_pages ?? ""}
            onChange={(v) => setTargets((t) => ({ ...t, hifz_pages: Number(v) || 0 }))}
          />
          <Field
            label="مراجعة (صفحات/يوم)"
            value={targets.muraja_pages ?? ""}
            onChange={(v) =>
              setTargets((t) => ({ ...t, muraja_pages: Number(v) || 0 }))
            }
          />
          <Field
            label="سماع (دقائق/يوم)"
            value={targets.sama_minutes ?? ""}
            onChange={(v) =>
              setTargets((t) => ({ ...t, sama_minutes: Number(v) || 0 }))
            }
          />
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold" style={tajawal}>
              ملاحظات الخطة
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={ds.btnRound}
            />
          </div>
          <Button
            type="button"
            className={`${ds.btnRound} sm:col-span-2`}
            disabled={saving}
            onClick={savePlan}
            style={tajawal}
          >
            {saving ? "جاري الحفظ…" : "حفظ الخطة"}
          </Button>
        </CardContent>
      </Card>

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>رصد المعلم (آخر 21 يوماً)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm" style={tajawal}>
          {marks.length === 0 ? (
            <p className="text-muted-foreground">لا يوجد رصد بعد.</p>
          ) : (
            marks.map((m, i) => (
              <div key={i} className="flex justify-between border-b border-border py-1">
                <span>{String(m.mark_date)}</span>
                <span>
                  درجة: {m.score ?? "—"} · حضور تلقائي:{" "}
                  {m.attendance_auto ? "نعم" : "لا"}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>إنجاز المنافسات والبرامج</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm" style={tajawal}>
          {compSummary.length === 0 ? (
            <p className="text-muted-foreground">لا مشاركات مسجّلة بعد.</p>
          ) : (
            compSummary.map((c) => (
              <div key={String(c.id)} className="flex justify-between py-1">
                <span>{String(c.name_ar)}</span>
                <span className="text-muted-foreground">
                  {String(c.start_date)} — {String(c.end_date)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-semibold" style={tajawal}>
        {label}
      </label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={ds.btnRound}
      />
    </div>
  );
}
