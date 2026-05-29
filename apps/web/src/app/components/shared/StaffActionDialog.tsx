import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { DoubleConfirmDialog } from "./DoubleConfirmDialog";
import { tajawal } from "../../lib/design-system";

type ActionKind = "freeze" | "delete" | null;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  isActive: boolean;
  onFreeze: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onActivate?: () => void | Promise<void>;
};

/** اختيار تجميد أو حذف ثم تأكيد ثنائي */
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

  function closeAll() {
    setPending(null);
    onOpenChange(false);
  }

  if (pending === "freeze") {
    return (
      <DoubleConfirmDialog
        open
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title="تجميد الحساب"
        description={`سيتم تجميد حساب «${personName}» ولن يتمكن من الدخول حتى إعادة التفعيل.`}
        confirmLabel="تجميد"
        onConfirm={async () => {
          await onFreeze();
          closeAll();
        }}
      />
    );
  }

  if (pending === "delete") {
    return (
      <DoubleConfirmDialog
        open
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title="حذف نهائي"
        description={`سيتم حذف «${personName}» من النظام نهائياً. تأكد من عدم وجود ارتباطات تشغيلية.`}
        confirmLabel="حذف نهائي"
        destructive
        onConfirm={async () => {
          await onDelete();
          closeAll();
        }}
      />
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl" className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle style={tajawal}>إدارة الحساب — {personName}</AlertDialogTitle>
          <AlertDialogDescription style={tajawal}>
            اختر الإجراء المطلوب. التجميد يعطّل الدخول مؤقتاً؛ الحذف إزالة دائمة من القاعدة.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 py-2">
          {isActive ? (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              style={tajawal}
              onClick={() => setPending("freeze")}
            >
              تجميد الحساب
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              className="w-full justify-center"
              style={tajawal}
              onClick={async () => {
                await onActivate?.();
                closeAll();
              }}
            >
              إعادة التفعيل
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            className="w-full justify-center"
            style={tajawal}
            onClick={() => setPending("delete")}
          >
            حذف نهائي
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel style={tajawal}>إغلاق</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
