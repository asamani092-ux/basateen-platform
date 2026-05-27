import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Alert, AlertDescription } from "../../components/ui/alert";
import type {
  EduMatrixCircleOption,
  EduMatrixStudentRow,
  EduMatrixTrackOption,
} from "../../lib/api-client";
import { tajawal } from "../../lib/design-system";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: EduMatrixStudentRow | null;
  circles: EduMatrixCircleOption[];
  tracks: EduMatrixTrackOption[];
  onConfirm: (payload: {
    target_circle_id: number | null;
    target_track_id: number | null;
  }) => Promise<void>;
};

const NONE = "__none__";

export function StudentTransferModal({
  open,
  onOpenChange,
  student,
  circles,
  tracks,
  onConfirm,
}: Props) {
  const [circleId, setCircleId] = useState<string>(NONE);
  const [trackId, setTrackId] = useState<string>(NONE);
  const [busy, setBusy] = useState(false);

  if (!student) return null;

  async function handleSubmit() {
    setBusy(true);
    try {
      await onConfirm({
        target_circle_id: circleId === NONE ? null : Number(circleId),
        target_track_id: trackId === NONE ? null : Number(trackId),
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle style={tajawal}>نقل الطالب: {student.name}</DialogTitle>
          <DialogDescription style={tajawal}>
            الحلقة الحالية: {student.circle_name ?? "—"} | المسار:{" "}
            {student.track_name ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="border-amber-500/40 bg-amber-500/10">
          <AlertDescription style={tajawal}>
            إجراء النقل يحفظ سجلات الطالب التاريخية السابقة ولا يقوم بتصفيرها.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-sm font-medium" style={tajawal}>
              الحلقة المستهدفة
            </span>
            <Select value={circleId} onValueChange={setCircleId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر حلقة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>بدون حلقة</SelectItem>
                {circles.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium" style={tajawal}>
              المسار المستهدف
            </span>
            <Select value={trackId} onValueChange={setTrackId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر مساراً" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>بدون مسار</SelectItem>
                {tracks.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            إلغاء
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy} type="button">
            {busy ? "جاري النقل…" : "تأكيد النقل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
