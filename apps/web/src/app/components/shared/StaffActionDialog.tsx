import { useState } from "react";
import { PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { DoubleConfirmDialog } from "./DoubleConfirmDialog";
import { ds, tajawal } from "../../lib/design-system";

type ActionKind = "delete" | null;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  isActive: boolean;
  onFreeze: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onActivate?: () => void | Promise<void>;
};

/** إجراءات المنسوب — تعليق / تنشيط / حذف بتأكيد ثنائي للحذف */
export function StaffActionDialog({
  open,
  onOpenChange,
  personName,
  isActive,
  onFreeze,
  onDelete,
  onActivate,
}: Props) {
  const [pending, setPending] = useState<ActionKind>(null);
  const [busy, setBusy] = useState(false);

  function closeAll() {
    setPending(null);
    onOpenChange(false);
  }

  if (pending === "delete") {
    return (
      <DoubleConfirmDialog
        open
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title="حذف المنسوب"
        description={`سيتم حذف «${personName}» من القائمة الافتراضية وفك إسناد الحلقات والمسارات. السجلات التاريخية تبقى محفوظة.`}
        confirmLabel="حذف"
        destructive
        onConfirm={async () => {
          await onDelete();
          closeAll();
        }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.dialog} sm:max-w-md`} dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle style={tajawal}>إجراءات المنسوب</DialogTitle>
          <DialogDescription style={tajawal}>
            {personName}
            <span className="mx-2 text-muted-foreground">·</span>
            الحالة: {isActive ? "نشط" : "معلَّق"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {isActive ? (
            <Button
              type="button"
              variant="outline"
              className={`${ds.btnRound} ${ds.primaryActionBtn} w-full gap-2`}
              style={tajawal}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onFreeze();
                  closeAll();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <PauseCircle className="size-5 shrink-0" aria-hidden />
              {busy ? "جاري التعليق…" : "تعليق الحساب"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              className={`${ds.btnRound} ${ds.primaryActionBtn} w-full gap-2`}
              style={tajawal}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onActivate?.();
                  closeAll();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <PlayCircle className="size-5 shrink-0" aria-hidden />
              {busy ? "جاري التنشيط…" : "إعادة التنشيط"}
            </Button>
          )}

          <Button
            type="button"
            variant="destructive"
            className={`${ds.btnRound} ${ds.primaryActionBtn} w-full gap-2`}
            style={tajawal}
            onClick={() => setPending("delete")}
          >
            <Trash2 className="size-5 shrink-0" aria-hidden />
            حذف المنسوب
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className={`${ds.btnRound} min-h-11`}
            style={tajawal}
            onClick={() => onOpenChange(false)}
          >
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
