import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import {
  COMPETITION_CATEGORIES,
  COMPETITION_STAGE_OPTIONS,
  countCompetitionDays,
  defaultTargetForCategory,
  isAdditiveCategory,
  studentDailyFaces,
  type CompetitionCategory,
  type MemorizationUnit,
  type PreviewStudent,
  type StudentTargetRow,
  type TargetScope,
} from "../../lib/competition-engine";
import { ds, tajawal } from "../../lib/design-system";

type CircleOption = { id: number; name_ar: string };
type TrackOption = { id: number; name_ar: string };

type Props = {
  onCreated: (id: number) => void;
  onCancel: () => void;
};

const emptyScope = (): TargetScope => ({
  circle_ids: [],
  track_ids: [],
  stage_ids: [],
});

/** يطبّع المعرفات إلى أرقام — مصفوفة فارغة = «الكل» */
function normalizeScopeForApi(scope: TargetScope): TargetScope {
  const ids = (arr: number[]) =>
    arr.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    circle_ids: ids(scope.circle_ids),
    track_ids: ids(scope.track_ids),
    stage_ids: ids(scope.stage_ids),
  };
}

function clearScopeKey(key: keyof TargetScope) {
  return (prev: TargetScope): TargetScope => ({ ...prev, [key]: [] });
}

function mapPreviewToTargets(
  items: PreviewStudent[],
  category: CompetitionCategory,
): StudentTargetRow[] {
  return items.map((s) => ({
    student_id: s.student_id,
    full_name_ar: s.full_name_ar,
    current_memorization: s.current_memorization,
    target_amount:
      s.target_amount > 0
        ? s.target_amount
        : defaultTargetForCategory(category, s.current_memorization),
  }));
}

export function CompetitionCreateForm({ onCreated, onCancel }: Props) {
  const [nameAr, setNameAr] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<CompetitionCategory>("recitation");
  const [memorizationUnit, setMemorizationUnit] = useState<MemorizationUnit>("juz");
  const [targetScope, setTargetScope] = useState<TargetScope>(emptyScope);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [targets, setTargets] = useState<StudentTargetRow[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryRef = useRef(category);
  categoryRef.current = category;

  useEffect(() => {
    async function loadFilterOptions() {
      if (!canUseApi()) {
        setCircles([
          { id: 1, name_ar: "حلقة النور" },
          { id: 2, name_ar: "حلقة الإتقان" },
        ]);
        setTracks([{ id: 1, name_ar: "مسار الحفظ" }]);
        return;
      }
      setLoadingOptions(true);
      setError(null);
      try {
        const res = await api.competitionsFilterOptions();
        const circleRows = Array.isArray(res.circles) ? res.circles : [];
        const trackRows = Array.isArray(res.tracks) ? res.tracks : [];
        setCircles(
          circleRows.map((c) => ({
            id: Number(c.id),
            name_ar: String(c.name_ar ?? ""),
          })),
        );
        setTracks(
          trackRows.map((t) => ({
            id: Number(t.id),
            name_ar: String(t.name_ar ?? ""),
          })),
        );
        if (circleRows.length === 0 && trackRows.length === 0) {
          toast.warning("لا توجد حلقات أو مسارات مسجّلة في المجمع");
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "فشل تحميل الحلقات والمسارات";
        setError(`خطأ في البيانات الأساسية: ${msg}`);
        toast.error(`تعذّر جلب الحلقات والمسارات — ${msg}`);
        setCircles([]);
        setTracks([]);
      } finally {
        setLoadingOptions(false);
      }
    }
    void loadFilterOptions();
  }, []);

  const fetchPreview = useCallback(async (scope: TargetScope) => {
    if (!canUseApi()) {
      const mock: PreviewStudent[] = [
        {
          student_id: 1,
          full_name_ar: "أحمد محمد",
          circle_name: "حلقة النور",
          stage_id: 2,
          current_memorization: 5,
          target_amount: 0,
          memorization_amount: "5 أجزاء",
        },
      ];
      setTargets(mapPreviewToTargets(mock, categoryRef.current));
      return;
    }

    setLoadingPreview(true);
    setError(null);
    try {
      const targetScope = normalizeScopeForApi(scope);
      const res = await api.competitionsPreviewTargets({ target_scope: targetScope });
      const rawItems = res?.items;
      const items = Array.isArray(rawItems) ? (rawItems as PreviewStudent[]) : [];
      if (res?.error) {
        toast.error(`خطأ في جلب الطلاب: ${res.error}`);
      }
      setTargets(mapPreviewToTargets(items, categoryRef.current));
      if (items.length === 0) {
        toast.info("لا يوجد طلاب مطابقون للفلتر المحدد");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل تحميل المستهدفين";
      setError(msg);
      toast.error(`تعذّر جلب الطلاب — ${msg}`);
      setTargets([]);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    void fetchPreview(targetScope);
  }, [targetScope, fetchPreview]);

  useEffect(() => {
    setTargets((prev) =>
      prev.length
        ? mapPreviewToTargets(
            prev.map((t) => ({
              student_id: t.student_id,
              full_name_ar: t.full_name_ar,
              circle_name: null,
              stage_id: null,
              current_memorization: t.current_memorization,
              target_amount: t.target_amount,
              memorization_amount: null,
            })),
            category,
          )
        : prev,
    );
  }, [category]);

  function toggleScopeId(key: keyof TargetScope, id: number) {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId <= 0) return;
    setTargetScope((prev) => {
      const set = new Set(prev[key].map(Number));
      if (set.has(numId)) set.delete(numId);
      else set.add(numId);
      return { ...prev, [key]: [...set] };
    });
  }

  function updateTargetAmount(studentId: number, amount: number) {
    setTargets((prev) =>
      prev.map((t) =>
        t.student_id === studentId ? { ...t, target_amount: amount } : t,
      ),
    );
  }

  function copyMemorizationToTarget(studentId: number) {
    setTargets((prev) =>
      prev.map((t) =>
        t.student_id === studentId
          ? { ...t, target_amount: t.current_memorization }
          : t,
      ),
    );
  }

  async function submit() {
    if (!nameAr.trim()) return;
    if (targets.length === 0) {
      setError("طبّق فلتر الاستهداف واختر طلاباً مستهدفين");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const res = await api.competitionsCreate({
        name_ar: nameAr.trim(),
        start_date: startDate,
        end_date: endDate,
        category,
        target_scope: normalizeScopeForApi(targetScope),
        rules:
          category === "new_memorization"
            ? { memorization_unit: memorizationUnit }
            : undefined,
        targets: targets.map((t) => ({
          student_id: t.student_id,
          current_memorization: t.current_memorization,
          target_amount: t.target_amount,
        })),
      });
      onCreated(res.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإنشاء");
    } finally {
      setCreating(false);
    }
  }

  const competitionDays = countCompetitionDays(startDate, endDate);
  const sampleDailyFaces =
    category === "new_memorization" && targets.length > 0
      ? studentDailyFaces(memorizationUnit, targets[0].target_amount, competitionDays)
      : null;

  const showCopyButton = !isAdditiveCategory(category);

  return (
    <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <section className="space-y-4">
        <h3 className="font-semibold text-sm border-b pb-2" style={tajawal}>
          القسم الأول — هوية المنافسة
        </h3>
        <div className="space-y-2">
          <Label style={tajawal}>اسم المنافسة</Label>
          <Input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            className={ds.btnRound}
            placeholder="مثال: مسابقة السرد الشهرية"
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
        <div className="space-y-2">
          <Label style={tajawal}>نوع المنافسة</Label>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as CompetitionCategory)}
          >
            <SelectTrigger className={ds.btnRound}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPETITION_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {category === "new_memorization" && (
          <div className="space-y-2">
            <Label style={tajawal}>وحدة الحفظ المستهدفة</Label>
            <Select
              value={memorizationUnit}
              onValueChange={(v) => setMemorizationUnit(v as MemorizationUnit)}
            >
              <SelectTrigger className={ds.btnRound}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="juz">أجزاء</SelectItem>
                <SelectItem value="hizb">أحزاب</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground" style={tajawal}>
              {memorizationUnit === "juz"
                ? "كل جزء = 20 وجهًا · يُقسَّم على أيام المنافسة"
                : "كل حزب = 10 وجوه · يُقسَّم على أيام المنافسة"}
              {sampleDailyFaces != null
                ? ` · مثال يومي: ${sampleDailyFaces} وجه`
                : null}
            </p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-semibold text-sm border-b pb-2" style={tajawal}>
          القسم الثاني — الاستهداف الذكي
        </h3>

        {loadingOptions && (
          <p className="text-sm text-muted-foreground flex items-center gap-2" style={tajawal}>
            <Loader2 className="w-4 h-4 animate-spin" />
            جاري تحميل الحلقات والمسارات…
          </p>
        )}

        {!loadingOptions && circles.length === 0 && tracks.length === 0 && (
          <p className="text-sm text-amber-700" style={tajawal}>
            لم تُحمّل الحلقات أو المسارات. تحقق من الاتصال أو صلاحيات الحساب.
          </p>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-2" style={tajawal}>
            حلقات
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTargetScope(clearScopeKey("circle_ids"))}
              className={`px-3 py-1 rounded-full text-sm border ${
                targetScope.circle_ids.length === 0
                  ? "bg-primary text-primary-foreground"
                  : "border-border"
              }`}
              style={tajawal}
            >
              الكل
            </button>
            {circles.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleScopeId("circle_ids", c.id)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  targetScope.circle_ids.includes(c.id)
                    ? "bg-primary text-primary-foreground"
                    : "border-border"
                }`}
                style={tajawal}
              >
                {c.name_ar}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2" style={tajawal}>
            مسارات
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTargetScope(clearScopeKey("track_ids"))}
              className={`px-3 py-1 rounded-full text-sm border ${
                targetScope.track_ids.length === 0
                  ? "bg-primary text-primary-foreground"
                  : "border-border"
              }`}
              style={tajawal}
            >
              الكل
            </button>
            {tracks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleScopeId("track_ids", t.id)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  targetScope.track_ids.includes(t.id)
                    ? "bg-primary text-primary-foreground"
                    : "border-border"
                }`}
                style={tajawal}
              >
                {t.name_ar}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2" style={tajawal}>
            المرحلة الدراسية (بدون تلقين)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTargetScope(clearScopeKey("stage_ids"))}
              className={`px-3 py-1 rounded-full text-sm border ${
                targetScope.stage_ids.length === 0
                  ? "bg-primary text-primary-foreground"
                  : "border-border"
              }`}
              style={tajawal}
            >
              الكل
            </button>
            {COMPETITION_STAGE_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleScopeId("stage_ids", s.id)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  targetScope.stage_ids.includes(s.id)
                    ? "bg-primary text-primary-foreground"
                    : "border-border"
                }`}
                style={tajawal}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loadingPreview && (
          <p className="text-sm text-muted-foreground flex items-center gap-2" style={tajawal}>
            <Loader2 className="w-4 h-4 animate-spin" />
            جاري تحميل المستهدفين…
          </p>
        )}

        {targets.length > 0 && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm" style={tajawal}>
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-2">اسم الطالب</th>
                  <th className="text-right p-2">مقدار الحفظ الحالي</th>
                  <th className="text-right p-2">
                    {isAdditiveCategory(category)
                      ? memorizationUnit === "juz"
                        ? "القيمة المضافة (أجزاء)"
                        : "القيمة المضافة (أحزاب)"
                      : category === "review"
                        ? "أجزاء المراجعة"
                        : "العدد المستهدف (جزء)"}
                  </th>
                  {showCopyButton && <th className="p-2 w-24" />}
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={t.student_id} className="border-t">
                    <td className="p-2">{t.full_name_ar}</td>
                    <td className="p-2 tabular-nums">{t.current_memorization}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        value={t.target_amount}
                        onChange={(e) =>
                          updateTargetAmount(t.student_id, Number(e.target.value))
                        }
                        className={`${ds.btnRound} h-8 w-24`}
                      />
                    </td>
                    {showCopyButton && (
                      <td className="p-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={ds.btnRound}
                          onClick={() => copyMemorizationToTarget(t.student_id)}
                          title="نسخ الحفظ الحالي كمستهدف"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground p-2" style={tajawal}>
              {isAdditiveCategory(category)
                ? `حفظ جديد: العدد المستهدف = القيمة المضافة (${memorizationUnit === "juz" ? "أجزاء" : "أحزاب"}) · ${competitionDays} يومًا.`
                : category === "review"
                  ? "مراجعة: المستهدف = أجزاء المراجعة من المحفوظ الحالي (قابل للتعديل)."
                  : "سرد: يمكن نسخ الحفظ الحالي أو تحديد رقم أقل — يُحوَّل تلقائيًا إلى أحزاب (جزء = حزبان)."}
            </p>
          </div>
        )}

        {!loadingPreview && targets.length === 0 && (
          <p className="text-sm text-muted-foreground" style={tajawal}>
            لا يوجد طلاب مطابقون للفلتر المحدد. جرّب «الكل» أو فلتراً أوسع.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2 justify-end sticky bottom-0 bg-background pt-2 border-t">
        <Button type="button" variant="outline" className={ds.btnRound} onClick={onCancel} style={tajawal}>
          إلغاء
        </Button>
        <Button
          type="button"
          className={ds.btnRound}
          disabled={
            creating ||
            !nameAr.trim() ||
            targets.length === 0
          }
          onClick={() => void submit()}
          style={tajawal}
        >
          {creating ? "جاري الإنشاء…" : "إنشاء المنافسة"}
        </Button>
      </div>
    </div>
  );
}
