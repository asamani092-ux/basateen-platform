import { useCallback, useEffect, useState } from "react";
import { CircleCapacityBadge } from "../../components/admin/CircleCapacityBadge";
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
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
import { api, type CircleOption } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { stageLabel, type StageId } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";

export function AdminCirclesPage() {
  const [items, setItems] = useState<CircleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasApi = Boolean(getApiToken());

  const load = useCallback(async () => {
    if (!hasApi) {
      setError("أعد تسجيل الدخول لربط API");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.circles();
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [hasApi]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className={ds.card}>
      <CardHeader>
        <CardTitle style={tajawal}>الحلقات التشغيلية</CardTitle>
        <CardDescription style={tajawal}>
          للمشرف — تنبيه لطيف عند اقتراب الحلقة من السعة الافتراضية (≤ 3 مقاعد)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive mb-4" style={tajawal}>
            {error}
          </p>
        )}
        {loading ? (
          <p className="text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <Table className={ds.tableMin}>
            <TableHeader>
              <TableRow>
                <TableHead className={`${ds.table.head} ${ds.table.colName}`} style={tajawal}>
                  الحلقة
                </TableHead>
                <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                  المرحلة
                </TableHead>
                <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                  العدد / الافتراضي
                </TableHead>
                <TableHead className={`${ds.table.head} ${ds.table.colStatus}`} style={tajawal}>
                  الحالة
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableTruncatedCell style={tajawal}>{c.name_ar}</TableTruncatedCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {c.stage_id ? stageLabel(c.stage_id as StageId) : "—"}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {c.student_count ?? "—"}/
                    {c.default_capacity ?? c.capacity}
                  </TableCell>
                  <TableCell className={ds.table.cell}>
                    <CircleCapacityBadge circle={c} />
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
