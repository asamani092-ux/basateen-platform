import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
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
  defaultTargetForCategory,
  isAdditiveCategory,
  type CompetitionCategory,
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

export function CompetitionCreateForm({ onCreated, onCancel }: Props) {
  const [nameAr, setNameAr] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<CompetitionCategory>("recitation");
  const [customCategory, setCustomCategory] = useState("");
  const [targetScope, setTargetScope] = useState<TargetScope>(emptyScope);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [previewStudents, setPreviewStudents] = useState<PreviewStudent[]>([]);
  const [targets, setTargets] = useState<StudentTargetRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseApi()) {
      setCircles([
        { id: 1, name_ar: "حلقة النور" },
        { id: 2, name_ar: "حلقة الإتقان" },
      ]);
      setTracks([{ id: 1, name_ar: "مسار الحفظ" }]);
      return;
    }
    api.eduTargetOptions().then((res) => {
      setCircles(
        (res.circles as Array<Record<string, unknown>>).map((c) => ({
          id: Number(c.id),
          name_ar: String(c.name_ar),
        })),
      );
      setTracks(
        (res.tracks as Array<Record<string, unknown>>).map((t) => ({
          id: Number(t.id),
          name_ar: String(t.name_ar),
        })),
      );
    });
  }, []);

  const loadPreview = useCallback(async () => {
    if (!canUseApi()) {
      const mock: PreviewStudent[] = [
        {
          student_id: 1,
          full_name_ar: "أحمد محمد",
          circle_name: "حلقة النور",
          stage_id: 2,
          current_memorization: 5,
          memorization_amount: "5 أجزاء",
        },
        {
          student_id: 2,
          full_name_ar: "خالد سعود",
          circle_name: "حلقة الإتقان",
          stage_id: 3,
          current_memorization: 10,
          memorization_amount: "10 أجزاء",
        },
      ];
      setPreviewStudents(mock);
      setTargets(
        mock.map((s) => ({
          student_id: s.student_id,
          full_name_ar: s.full_name_ar,
          current_memorization: s.current_memorization,
          target_amount: defaultTargetForCategory(category, s.current_memorization),
        })),
      );
      return;
    }

    setLoadingPreview(true);
    setError(null);
    try {
      const res = await api.competitionsPreviewTargets({ target_scope: targetScope });
      const items = res.items as PreviewStudent[];
      setPreviewStudents(items);
      setTargets(
        items.map((s) => ({
          student_id: s.student_id,
          full_name_ar: s.full_name_ar,
          current_memorization: s.current_memorization,
          target_amount: defaultTargetForCategory(category, s.current_memorization),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل المستهدفين");
      setPreviewStudents([]);
      setTargets([]);
    } finally {
      setLoadingPreview(false);
    }
  }, [targetScope, category]);

  useEffect(() => {
    const hasFilter =
      targetScope.circle_ids.length > 0 ||
      targetScope.track_ids.length > 0 ||
      targetScope.stage_ids.length > 0;
    if (!hasFilter) {
      setPreviewStudents([]);
      setTargets([]);
      return;
    }
    const timer = window.setTimeout(() => void loadPreview(), 400);
    return () => window.clearTimeout(timer);
  }, [loadPreview, targetScope]);

  useEffect(() => {
    setTargets((prev) =>
      prev.map((t) => ({
        ...t,
        target_amount: defaultTargetForCategory(category, t.current_memorization),
      })),
    );
  }, [category]);

  function toggleScopeId(
    key: keyof TargetScope,
    id: number,
  ) {
    setTargetScope((prev) => {
      const set = new Set(prev[key]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
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
    if (category === "other" && !customCategory.trim()) {
      setError("اكتب نوع المنافسة عند اختيار «أخرى»");
      return;
    }
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
        custom_category: category === "other" ? customCategory.trim() : null,
        target_scope: targetScope,
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
        {category === "other" && (
          <div className="space-y-2">
            <Label style={tajawal}>
              نوع المنافسة (مخصص) <span className="text-destructive">*</span>
            </Label>
            <Input
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              className={ds.btnRound}
              placeholder="اكتب نوع المنافسة"
              required
            />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-semibold text-sm border-b pb-2" style={tajawal}>
          القسم الثاني — الاستهداف الذكي
        </h3>

        <div>
          <p className="text-xs text-muted-foreground mb-2" style={tajawal}>
            حلقات
          </p>
          <div className="flex flex-wrap gap-2">
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
            المرحلة الدراسية
          </p>
          <div className="flex flex-wrap gap-2">
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
                      ? "القيمة المضافة (أجزاء)"
                      : "العدد المستهدف"}
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
                ? "حفظ جديد: العدد المستهدف = القيمة المضافة فقط (لا يُجمع مع الحفظ الحالي في هذا الحقل)."
                : "سرد/مراجعة: يمكن نسخ الحفظ الحالي أو تحديد رقم أقل."}
            </p>
          </div>
        )}

        {!loadingPreview &&
          targetScope.circle_ids.length +
            targetScope.track_ids.length +
            targetScope.stage_ids.length >
            0 &&
          targets.length === 0 && (
            <p className="text-sm text-muted-foreground" style={tajawal}>
              لا يوجد طلاب مطابقون للفلتر المحدد.
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
            targets.length === 0 ||
            (category === "other" && !customCategory.trim())
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
