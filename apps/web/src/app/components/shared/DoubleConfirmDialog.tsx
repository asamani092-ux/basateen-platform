import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { tajawal } from "../../lib/design-system";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

/** تأكيد ثنائي: خطوة أولى ثم تأكيد نهائي قبل تنفيذ إجراء حساس */
export function DoubleConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "تأكيد",
  destructive = false,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const confirmLockRef = useRef(false);

  function handleOpenChange(next: boolean) {
    if (!next) setStep(1);
    onOpenChange(next);
  }

  async function handleFinalConfirm() {
    if (confirmLockRef.current) return;
    confirmLockRef.current = true;
    setBusy(true);
    try {
      await onConfirm();
      setStep(1);
      onOpenChange(false);
    } finally {
      confirmLockRef.current = false;
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent dir="rtl" className="rounded-2xl">
        {step === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle style={tajawal}>{title}</AlertDialogTitle>
              <AlertDialogDescription style={tajawal}>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel style={tajawal}>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                style={tajawal}
                onClick={(e) => {
                  e.preventDefault();
                  setStep(2);
                }}
              >
                متابعة
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle style={tajawal}>تأكيد نهائي</AlertDialogTitle>
              <AlertDialogDescription style={tajawal}>
                هذا الإجراء حساس. اضغط «{confirmLabel}» للمتابعة — لا يمكن التراجع بسهولة.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel
                style={tajawal}
                onClick={() => setStep(1)}
                disabled={busy}
              >
                رجوع
              </AlertDialogCancel>
              <AlertDialogAction
                style={tajawal}
                className={destructive ? "bg-destructive hover:bg-destructive/90" : undefined}
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  void handleFinalConfirm();
                }}
              >
                {busy ? "جاري التنفيذ…" : confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
