import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, Search, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { Badge } from "../../components/ui/badge";
import { api, type EduMatrixStudentRow } from "../../lib/api-client";
import { StudentTransferModal } from "./StudentTransferModal";
import { tajawal } from "../../lib/design-system";

export function MasterGridConsole() {
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [items, setItems] = useState<EduMatrixStudentRow[]>([]);
  const [circles, setCircles] = useState<
    Awaited<ReturnType<typeof api.eduMatrixMasterGrid>>["circles"]
  >([]);
  const [tracks, setTracks] = useState<
    Awaited<ReturnType<typeof api.eduMatrixMasterGrid>>["tracks"]
  >([]);
  const [stages, setStages] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [transferStudent, setTransferStudent] =
    useState<EduMatrixStudentRow | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<
    Awaited<ReturnType<typeof api.eduMatrixStudentHistory>> | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.eduMatrixMasterGrid({
        q: q || undefined,
        stage: stage === "all" ? undefined : stage,
      });
      setItems(data.items);
      setCircles(data.circles);
      setTracks(data.tracks);
      setStages(data.stages);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الشبكة");
    } finally {
      setLoading(false);
    }
  }, [q, stage]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  const placementLabel = useMemo(
    () =>
      ({
        hybrid: "هجين",
        circle: "حلقة",
        track: "مسار",
        unassigned: "غير مسكّن",
      }) as const,
    [],
  );

  async function openHistory(studentId: number) {
    setHistoryId(studentId);
    setHistoryLoading(true);
    try {
      const data = await api.eduMatrixStudentHistory(studentId);
      setHistoryData(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل السجل");
      setHistoryId(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pr-10"
            placeholder="بحث بالاسم أو الهوية أو جوال ولي الأمر"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={tajawal}
          />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="المرحلة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المراحل</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="border rounded-xl overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={tajawal}>الطالب</TableHead>
                <TableHead style={tajawal}>المرحلة</TableHead>
                <TableHead style={tajawal}>الحلقة</TableHead>
                <TableHead style={tajawal}>المسار</TableHead>
                <TableHead style={tajawal}>الوضع</TableHead>
                <TableHead className="text-left" style={tajawal}>
                  إجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium" style={tajawal}>
                      {row.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.national_id}
                    </div>
                  </TableCell>
                  <TableCell style={tajawal}>{row.stage_label}</TableCell>
                  <TableCell style={tajawal}>
                    {row.circle_name ?? "—"}
                  </TableCell>
                  <TableCell style={tajawal}>{row.track_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {placementLabel[row.placement]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => void openHistory(row.id)}
                      >
                        <History className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => setTransferStudent(row)}
                      >
                        <Shuffle className="size-4 ml-1" />
                        نقل
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!items.length && (
            <p className="text-center py-8 text-muted-foreground" style={tajawal}>
              لا توجد صفوف — نفّذ db:remote:022 ثم POST /api/setup/seed-edu-matrix
            </p>
          )}
        </div>
      )}

      <StudentTransferModal
        open={!!transferStudent}
        onOpenChange={(o) => !o && setTransferStudent(null)}
        student={transferStudent}
        circles={circles}
        tracks={tracks}
        onConfirm={async (payload) => {
          if (!transferStudent) return;
          await api.eduMatrixTransfer({
            student_id: transferStudent.id,
            ...payload,
          });
          toast.success("تم النقل بنجاح");
          await load();
        }}
      />

      <Sheet open={historyId != null} onOpenChange={(o) => !o && setHistoryId(null)}>
        <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle style={tajawal}>
              السجل التاريخي — {historyData?.student.name ?? "…"}
            </SheetTitle>
          </SheetHeader>
          {historyLoading ? (
            <Loader2 className="mx-auto mt-8 animate-spin" />
          ) : (
            <ul className="mt-4 space-y-3">
              {(historyData?.contexts ?? []).map((c) => (
                <li
                  key={`${c.context_type}-${c.context_id}`}
                  className="border rounded-lg p-3 text-sm"
                  style={tajawal}
                >
                  <p className="font-semibold">
                    {c.context_name} ({c.context_type})
                  </p>
                  <p className="text-muted-foreground">
                    {c.first_date} → {c.last_date} — {c.log_days} يوم رصد
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
