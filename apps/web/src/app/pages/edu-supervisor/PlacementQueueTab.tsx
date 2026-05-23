import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { matchesArabicName } from "../../lib/attendance-search";
import { stageLabel } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";

type Row = {
  id: number;
  full_name_ar: string;
  phone: string | null;
  school_grade: string | null;
  stage_id: number | null;
  age: number | null;
  guardian_phone: string | null;
};

export function PlacementQueueTab() {
  const [items, setItems] = useState<Row[]>([]);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameQuery, setNameQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [circlePick, setCirclePick] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [res, cr] = await Promise.all([
        api.studentsPendingPlacement(),
        api.circles(),
      ]);
      setItems(res.items as Row[]);
      setCircles(cr.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((r) => {
      if (stageFilter && String(r.stage_id) !== stageFilter) return false;
      if (!matchesArabicName(nameQuery, r.full_name_ar)) return false;
      return true;
    });
  }, [items, nameQuery, stageFilter]);

  async function assign(studentId: number) {
    const circleId = circlePick[studentId];
    if (!circleId) {
      setError("اختر الحلقة أولاً");
      return;
    }
    setAssigningId(studentId);
    setError(null);
    try {
      await api.transferStudent(studentId, {
        circle_id: circleId,
        note: "تسكين من انتظار القبول",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التسكين");
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <Card className={ds.card}>
      <CardHeader>
        <CardTitle style={tajawal}>انتظار التسكين</CardTitle>
        <CardDescription style={tajawal}>
          طلاب قبلّهم المشرف العام — عيّن الحلقة مباشرة (نقل تراكمي)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="search"
            placeholder="بحث بالاسم…"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            className={ds.btnRound}
            style={tajawal}
          />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-xl border border-border px-3 py-2 text-sm sm:w-48"
            style={tajawal}
          >
            <option value="">كل المراحل</option>
            {[1, 2, 3, 4].map((id) => (
              <option key={id} value={String(id)}>
                {stageLabel(id)}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className={ds.alert.error} style={tajawal}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : filtered.length === 0 ? (
          <p className={ds.alert.info} style={tajawal}>
            لا يوجد طلاب بانتظار التسكين في هذا الفلتر.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={tajawal}>الاسم</TableHead>
                <TableHead style={tajawal}>المرحلة</TableHead>
                <TableHead style={tajawal}>الحلقة</TableHead>
                <TableHead style={tajawal}>تسكين</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell style={tajawal}>
                    <Link
                      to={`/edu-supervisor/students/${row.id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {row.full_name_ar}
                    </Link>
                  </TableCell>
                  <TableCell style={tajawal}>
                    {stageLabel(row.stage_id)}
                  </TableCell>
                  <TableCell>
                    <select
                      className="rounded-lg border border-border px-2 py-1 text-sm w-full max-w-[200px]"
                      value={circlePick[row.id] ?? ""}
                      onChange={(e) =>
                        setCirclePick((p) => ({
                          ...p,
                          [row.id]: Number(e.target.value),
                        }))
                      }
                      style={tajawal}
                    >
                      <option value="">اختر حلقة…</option>
                      {circles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name_ar}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      className={ds.btnRound}
                      disabled={assigningId === row.id}
                      onClick={() => assign(row.id)}
                      style={tajawal}
                    >
                      {assigningId === row.id ? "…" : "اعتماد التسكين"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
