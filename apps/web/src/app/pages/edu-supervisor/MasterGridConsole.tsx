import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type MasterRow = {
  id: number;
  full_name_ar: string;
  is_active: number;
  stage_id: number | null;
  school_grade: string | null;
  admission_status: string | null;
  current_circle_id: number | null;
  current_circle_name: string | null;
  current_track_id: number | null;
  current_track_name: string | null;
};

type TrackRow = { id: number; name_ar: string };

export function MasterGridConsole() {
  const [items, setItems] = useState<MasterRow[]>([]);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<MasterRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [circleId, setCircleId] = useState<number | "">("");
  const [trackId, setTrackId] = useState<number | "">("");

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduMasterGrid({
        pending_acceptance: pendingOnly ? "1" : "0",
        q: query,
      });
      setItems(res.items);
      setCircles(res.circles);
      setTracks(res.tracks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الشبكة المركزية");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [pendingOnly, query]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const titleCount = useMemo(() => items.length, [items.length]);

  function openAdmission(row: MasterRow) {
    setOpenRow(row);
    setCircleId(row.current_circle_id ?? "");
    setTrackId(row.current_track_id ?? "");
  }

  async function applyAdmission() {
    if (!openRow) return;
    if (!circleId && !trackId) {
      setError("اختر حلقة أو مسار على الأقل");
      return;
    }
    const targetCircle = circleId || openRow.current_circle_id;
    if (!targetCircle) {
      setError("لا يمكن ربط مسار فقط بدون حلقة حالية. اختر حلقة أولاً.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.transferStudent(openRow.id, {
        circle_id: Number(targetCircle),
        track_id: trackId === "" ? undefined : Number(trackId),
        note: "إجراء القبول والتوزيع الفوري من الشبكة المركزية",
      });
      setOpenRow(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تنفيذ القبول والتوزيع");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className={ds.page.title} style={tajawal}>
          شبكة البيانات الكلية — القبول والتوزيع المباشر
        </h2>
        <p className={ds.page.description} style={tajawal}>
          قراءة حية لكل الطلاب (النشطين والموقوفين) مع تنفيذ القبول/التوزيع دون المساس بسجل Ledger التاريخي.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className={ds.btnRound}
          variant={pendingOnly ? "default" : "outline"}
          onClick={() => setPendingOnly((v) => !v)}
          style={tajawal}
        >
          {pendingOnly ? "إلغاء فلتر انتظار القبول" : "انتظار القبول والتوزيع"}
        </Button>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
          placeholder="بحث سريع باسم الطالب..."
          style={tajawal}
        />
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={ds.card}>
        <div className="p-4 border-b border-border text-sm text-muted-foreground" style={tajawal}>
          عدد السجلات: {titleCount}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={tajawal}>الطالب</TableHead>
              <TableHead style={tajawal}>الحالة</TableHead>
              <TableHead style={tajawal}>القبول الحالي</TableHead>
              <TableHead style={tajawal}>المسار الحالي</TableHead>
              <TableHead style={tajawal}>الإجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} style={tajawal}>
                  جاري التحميل...
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell style={tajawal}>
                    <Link className="text-primary hover:underline" to={`/edu-supervisor/students/${row.id}`}>
                      {row.full_name_ar}
                    </Link>
                  </TableCell>
                  <TableCell style={tajawal}>{row.is_active === 1 ? "نشط" : "موقوف"}</TableCell>
                  <TableCell style={tajawal}>{row.current_circle_name ?? "غير مقبول بعد"}</TableCell>
                  <TableCell style={tajawal}>{row.current_track_name ?? "غير مرتبط"}</TableCell>
                  <TableCell>
                    <Button type="button" size="sm" variant="outline" onClick={() => openAdmission(row)} style={tajawal}>
                      قبول/توزيع
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(openRow)} onOpenChange={(v) => !v && setOpenRow(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>إجراء القبول والتوزيع الفوري للطالب في الحلقات والمسارات</DialogTitle>
            <DialogDescription style={tajawal}>
              قبول الطالب في حلقة أو مسار جديدة يحفظ سجلاته التاريخية السابقة في الـ Ledger ولا يصفرها نهائياً
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm" style={tajawal}>
              الحلقة
              <select
                className="mt-1 w-full rounded-xl border border-border px-3 py-2"
                value={circleId}
                onChange={(e) => setCircleId(e.target.value ? Number(e.target.value) : "")}
                style={tajawal}
              >
                <option value="">بدون تغيير</option>
                {circles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_ar}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm" style={tajawal}>
              المسار
              <select
                className="mt-1 w-full rounded-xl border border-border px-3 py-2"
                value={trackId}
                onChange={(e) => setTrackId(e.target.value ? Number(e.target.value) : "")}
                style={tajawal}
              >
                <option value="">بدون تغيير</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name_ar}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenRow(null)} style={tajawal}>
              إلغاء
            </Button>
            <Button type="button" onClick={applyAdmission} disabled={saving} style={tajawal}>
              {saving ? "جارٍ التنفيذ..." : "تنفيذ القبول والتوزيع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
