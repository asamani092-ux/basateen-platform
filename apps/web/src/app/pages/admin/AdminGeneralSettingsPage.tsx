import { useCallback, useEffect, useState } from "react";
import { CalendarRange, PlayCircle, StopCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

const END_CONFIRM = "إنهاء الفصل";

export function AdminGeneralSettingsPage() {
  const [semesterActive, setSemesterActive] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await api.adminComplexSettings();
      setSemesterActive(Boolean(r.semester_active));
      setStartDate(r.semester_start_date ?? null);
      setEndDate(r.semester_end_date ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الإعدادات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startSemester() {
    setBusy(true);
    setError(null);
    try {
      await api.adminSemesterStart();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل بدء الفصل");
    } finally {
      setBusy(false);
    }
  }

  async function endSemester() {
    if (confirmText.trim() !== END_CONFIRM) {
      setError(`اكتب «${END_CONFIRM}» للتأكيد`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminSemesterEnd(confirmText.trim());
      setEndOpen(false);
      setConfirmText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إنهاء الفصل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          الإعدادات العامة
        </h2>
        <p className={ds.page.description} style={tajawal}>
          إدارة الفصل الدراسي النشط — تشغيل وإيقاف دون تواريخ مسبقة.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <CalendarRange className="w-5 h-5 text-primary" />
            الفصل الدراسي
          </CardTitle>
          <CardDescription style={tajawal}>
            {loading
              ? "جاري التحميل…"
              : semesterActive
                ? `الفصل نشط من ${startDate ?? "—"}`
                : endDate
                  ? `آخر فصل انتهى في ${endDate}`
                  : "لا يوجد فصل نشط حالياً"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!semesterActive ? (
            <Button
              type="button"
              size="lg"
              className={`${ds.btnRound} w-full min-h-14 text-base`}
              disabled={busy || loading}
              onClick={() => void startSemester()}
              style={tajawal}
            >
              <PlayCircle className="w-5 h-5" />
              بدء فصل دراسي جديد
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              variant="destructive"
              className={`${ds.btnRound} w-full min-h-14 text-base`}
              disabled={busy || loading}
              onClick={() => setEndOpen(true)}
              style={tajawal}
            >
              <StopCircle className="w-5 h-5" />
              إنهاء الفصل الدراسي الحالي
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent className={ds.dialog} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>تأكيد إنهاء الفصل</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground" style={tajawal}>
            هذا الإجراء يوقف الفصل الحالي ويسجّل تاريخ اليوم كنهاية. اكتب «
            {END_CONFIRM}» للمتابعة.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={END_CONFIRM}
            className={ds.btnRound}
            style={tajawal}
          />
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              onClick={() => setEndOpen(false)}
              style={tajawal}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={ds.btnRound}
              disabled={busy}
              onClick={() => void endSemester()}
              style={tajawal}
            >
              {busy ? "جاري الإنهاء…" : "تأكيد الإنهاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
