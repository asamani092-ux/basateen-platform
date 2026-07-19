import { useEffect, useState } from "react";
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
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  isActive: boolean;
  onFreeze: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onActivate?: () => void | Promise<void>;
};

/** خطوات تأكيد الحذف — شرح ثم تنفيذ صريح */
type DeleteConfirmStep = null | 1 | 2;

/** إجراءات المنسوب — تعليق / تنشيط / حذف بتأكيد ثنائي صريح */
export function StaffActionDialog({
  open,
  onOpenChange,
  personName,
  isActive,
  onFreeze,
  onDelete,
  onActivate,
}: Props) {
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<DeleteConfirmStep>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setDeleteConfirmStep(null);
  }, [open]);

  function closeAll() {
    setDeleteConfirmStep(null);
    onOpenChange(false);
  }

  async function runDeleteFinal() {
    setBusy(true);
    try {
      await onDelete();
      closeAll();
    } finally {
      setBusy(false);
    }
  }

  if (deleteConfirmStep === 1) {
    return (
      <Dialog
        open
        onOpenChange={(o) => {
          if (!o) setDeleteConfirmStep(null);
        }}
      >
        <DialogContent className={`${ds.dialog} sm:max-w-md`} dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>حذف المنسوب</DialogTitle>
            <DialogDescription style={tajawal}>
              سيتم حذف «{personName}» من القائمة الافتراضية وفك إسناد الحلقات والمسارات فوراً.
              السجلات التاريخية (الحضور، المنافسات، التعيينات السابقة) تبقى محفوظة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              variant="outline"
              className={`${ds.btnRound} min-h-11`}
              style={tajawal}
              onClick={() => setDeleteConfirmStep(null)}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={`${ds.btnRound} ${ds.primaryActionBtn}`}
              style={tajawal}
              onClick={() => setDeleteConfirmStep(2)}
            >
              متابعة الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (deleteConfirmStep === 2) {
    return (
      <Dialog
        open
        onOpenChange={(o) => {
          if (!o) setDeleteConfirmStep(1);
        }}
      >
        <DialogContent className={`${ds.dialog} sm:max-w-md`} dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>تأكيد نهائي</DialogTitle>
            <DialogDescription style={tajawal}>
              هذا الإجراء لا يُراجع بسهولة. اضغط «نعم، احذف نهائياً» لتنفيذ حذف «{personName}».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              variant="outline"
              className={`${ds.btnRound} min-h-11`}
              style={tajawal}
              disabled={busy}
              onClick={() => setDeleteConfirmStep(1)}
            >
              رجوع
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={`${ds.btnRound} ${ds.primaryActionBtn}`}
              style={tajawal}
              disabled={busy}
              onClick={() => void runDeleteFinal()}
            >
              {busy ? "جاري الحذف…" : "نعم، احذف نهائياً"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            onClick={() => setDeleteConfirmStep(1)}
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
