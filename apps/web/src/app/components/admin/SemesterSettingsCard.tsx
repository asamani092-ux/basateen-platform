import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Download, PlayCircle, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";
import { downloadSemesterArchiveXlsx } from "../../lib/semester-archive-export";

const DAY_LABELS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const SEMESTER_END_CONFIRM = "إنهاء الفصل";

export function SemesterSettingsCard() {
  const [weeks, setWeeks] = useState(16);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [graduates, setGraduates] = useState(0);
  const [huffadh, setHuffadh] = useState(0);
  const [semesterActive, setSemesterActive] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const hasApi = canUseApi() && Boolean(getApiToken());

  const load = useCallback(async () => {
    if (!hasApi) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await api.adminComplexSettings();
      setWeeks(r.semester_weeks);
      setDays(r.school_days);
      setGraduates(r.graduates_count);
      setHuffadh(r.huffadh_count);
      setSemesterActive(Boolean(r.semester_active));
      setStartDate(r.semester_start_date ?? null);
      setEndDate(r.semester_end_date ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحميل الإعدادات");
    } finally {
      setLoading(false);
    }
  }, [hasApi]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }

  async function save() {
    if (!hasApi) {
      toast.error("أعد تسجيل الدخول بربط API");
      return;
    }
    setSaving(true);
    try {
      await api.adminPatchComplexSettings({
        semester_weeks: weeks,
        school_days: days,
        graduates_count: graduates,
        huffadh_count: huffadh,
      });
      toast.success("تم حفظ إعدادات المجمع");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function exportArchive() {
    if (!hasApi) {
      toast.error("أعد تسجيل الدخول بربط API");
      return;
    }
    setExporting(true);
    try {
      await downloadSemesterArchiveXlsx();
      toast.success("تم تنزيل أرشيف الفصل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تصدير الأرشيف");
    } finally {
      setExporting(false);
    }
  }

  async function startSemester() {
    if (!hasApi) return;
    setStarting(true);
    try {
      await api.adminSemesterStart();
      toast.success("تم بدء فصل دراسي جديد");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل بدء الفصل");
    } finally {
      setStarting(false);
    }
  }

  async function closeSemester() {
    if (!hasApi) return;
    setClosing(true);
    try {
      await api.adminSemesterEnd(SEMESTER_END_CONFIRM);
      setCloseOpen(false);
      toast.success("تم إغلاق الفصل الدراسي");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل إغلاق الفصل");
    } finally {
      setClosing(false);
    }
  }

  const semesterStatus = loading
    ? "جاري التحميل…"
    : semesterActive
      ? `الفصل نشط من ${startDate ?? "—"}`
      : endDate
        ? `آخر فصل انتهى في ${endDate}`
        : "لا يوجد فصل نشط حالياً";

  return (
    <>
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base" style={tajawal}>
            <CalendarDays className="w-5 h-5 text-primary" />
            إعدادات الفصل والمجمع
          </CardTitle>
          <CardDescription style={tajawal}>
            حصري للمدير العام — أسابيع الفصل والأيام الفعلية
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                أسابيع الفصل
              </label>
              <Input
                type="number"
                min={1}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                الخريجون
              </label>
              <Input
                type="number"
                min={0}
                value={graduates}
                onChange={(e) => setGraduates(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                الحفاظ
              </label>
              <Input
                type="number"
                min={0}
                value={huffadh}
                onChange={(e) => setHuffadh(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold mb-2" style={tajawal}>
              أيام الدراسة الفعلية
            </p>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((label, idx) => (
                <Button
                  key={idx}
                  type="button"
                  size="sm"
                  variant={days.includes(idx) ? "default" : "outline"}
                  className={ds.btnRound}
                  onClick={() => toggleDay(idx)}
                  style={tajawal}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <Button
            type="button"
            className={ds.btnRound}
            disabled={saving || !hasApi}
            onClick={() => void save()}
            style={tajawal}
          >
            {saving ? "جاري الحفظ…" : "حفظ الإعدادات"}
          </Button>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <p className="text-sm text-muted-foreground" style={tajawal}>
              {semesterStatus}
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className={`${ds.btnRound} min-h-12 flex-1 sm:flex-none`}
                disabled={exporting || loading || !hasApi}
                onClick={() => void exportArchive()}
                style={tajawal}
              >
                <Download className="w-5 h-5" />
                {exporting ? "جاري التصدير…" : "تصدير أرشيف الفصل (Excel)"}
              </Button>
              {!semesterActive ? (
                <Button
                  type="button"
                  size="lg"
                  className={`${ds.btnRound} min-h-12 flex-1 sm:flex-none`}
                  disabled={starting || loading || !hasApi}
                  onClick={() => void startSemester()}
                  style={tajawal}
                >
                  <PlayCircle className="w-5 h-5" />
                  {starting ? "جاري البدء…" : "بدء فصل دراسي جديد"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className={`${ds.btnRound} min-h-12 flex-1 sm:flex-none border-destructive/40 text-destructive hover:bg-destructive/10`}
                  disabled={closing || loading || !hasApi}
                  onClick={() => setCloseOpen(true)}
                  style={tajawal}
                >
                  <StopCircle className="w-5 h-5" />
                  إغلاق الفصل الدراسي
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className={ds.dialog} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>تأكيد إغلاق الفصل</DialogTitle>
            <DialogDescription style={tajawal}>
              هل قمت بتصدير أرشيف الفصل؟ إغلاق الفصل سيجمد البيانات الحالية للرجوع
              إليها لاحقاً
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              disabled={closing}
              onClick={() => setCloseOpen(false)}
              style={tajawal}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={ds.btnRound}
              disabled={closing}
              onClick={() => void closeSemester()}
              style={tajawal}
            >
              {closing ? "جاري الإغلاق…" : "تأكيد الإغلاق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
