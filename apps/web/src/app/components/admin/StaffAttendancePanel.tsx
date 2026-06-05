import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { TableTruncatedCell } from "../shared/TableTruncatedCell";
import { ds, tajawal } from "../../lib/design-system";
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";

type StaffOption = { id: number; full_name_ar: string; role: string };

export function StaffAttendancePanel({
  staff,
}: {
  staff: StaffOption[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<
    Array<{
      id: number;
      user_id: number;
      full_name_ar: string;
      role: string;
      status: string;
      notes: string | null;
    }>
  >([]);
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("present");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!getApiToken()) return;
    setLoading(true);
    try {
      const res = await api.adminStaffAttendance(date, date);
      setItems(
        res.items.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          full_name_ar: r.full_name_ar,
          role: r.role,
          status: r.status,
          notes: r.notes,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function record() {
    if (!userId) return;
    await api.adminStaffAttendanceUpsert({
      user_id: Number(userId),
      attendance_date: date,
      status,
    });
    setUserId("");
    await load();
  }

  return (
    <Card className={ds.card}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base" style={tajawal}>
          <ClipboardCheck className="w-5 h-5 text-primary" />
          حضور وانصراف الموظفين
        </CardTitle>
        <CardDescription style={tajawal}>
          تدقيق المدير العام — تسجيل يومي للمعلمين والمشرفين
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground" style={tajawal}>
              التاريخ
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={ds.field}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" style={tajawal}>
              الموظف
            </label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className={`${ds.select} min-w-[200px]`}
              style={tajawal}
            >
              <option value="">— اختر —</option>
              {staff.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.full_name_ar} ({s.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground" style={tajawal}>
              الحالة
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={ds.select}
              style={tajawal}
            >
              <option value="present">حاضر</option>
              <option value="absent">غائب</option>
              <option value="late">متأخر</option>
              <option value="leave">إجازة</option>
            </select>
          </div>
          <Button type="button" className={ds.btnRound} onClick={record} style={tajawal}>
            تسجيل
          </Button>
        </div>
        {loading ? (
          <p className="text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <Table className={ds.tableMin}>
            <TableHeader>
              <TableRow>
                <TableHead className={`${ds.table.head} ${ds.table.colName}`} style={tajawal}>
                  الاسم
                </TableHead>
                <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                  الدور
                </TableHead>
                <TableHead className={`${ds.table.head} ${ds.table.colStatusCompact}`} style={tajawal}>
                  الحالة
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableTruncatedCell className={ds.table.colName} style={tajawal}>
                    {r.full_name_ar}
                  </TableTruncatedCell>
                  <TableTruncatedCell style={tajawal}>{r.role}</TableTruncatedCell>
                  <TableCell
                    className={`${ds.table.cell} ${ds.table.colStatusCompact} whitespace-nowrap`}
                    style={tajawal}
                  >
                    {r.status}
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
