import { useEffect, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ds, tajawal } from "../../lib/design-system";

export type AdminEntityActionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityTitle: string;
  entityName: string;
  /** نشط = true، معلّق/معطّل = false */
  isActive: boolean;
  activeLabel?: string;
  suspendedLabel?: string;
  onToggleActive: () => Promise<void>;
  onDelete: () => Promise<void>;
  canDelete?: boolean;
  canToggle?: boolean;
  deleteHint?: string;
};

export function AdminEntityActionModal({
  open,
  onOpenChange,
  entityTitle,
  entityName,
  isActive,
  activeLabel = "نشط",
  suspendedLabel = "معلق",
  onToggleActive,
  onDelete,
  canDelete = true,
  canToggle = true,
  deleteHint,
}: AdminEntityActionModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setConfirmDelete(false);
  }, [open]);

  async function runToggle() {
    setBusy(true);
    try {
      await onToggleActive();
      onOpenChange(false);
    } catch {
      /* caller shows toast */
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    setBusy(true);
    try {
      await onDelete();
      onOpenChange(false);
    } catch {
      /* caller shows toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.dialog} sm:max-w-md`} dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle style={tajawal}>إجراءات {entityTitle}</DialogTitle>
          <DialogDescription style={tajawal}>
            {entityName}
            <span className="mx-2 text-muted-foreground">·</span>
            الحالة: {isActive ? activeLabel : suspendedLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {canToggle && (
            <Button
              type="button"
              variant="default"
              className={`${ds.btnRound} w-full gap-2`}
              style={tajawal}
              disabled={busy}
              onClick={() => void runToggle()}
            >
              {isActive ? (
                <>
                  <Pause className="size-4" />
                  تعليق ⏸️
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  تنشيط ▶️
                </>
              )}
            </Button>
          )}

          {canDelete && !confirmDelete && (
            <Button
              type="button"
              variant="destructive"
              className={`${ds.btnRound} w-full gap-2`}
              style={tajawal}
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              حذف نهائي 🗑️
            </Button>
          )}

          {canDelete && confirmDelete && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm text-destructive font-medium" style={tajawal}>
                هل أنت متأكد من الحذف النهائي؟ لا يمكن التراجع
              </p>
              {deleteHint ? (
                <p className="text-xs text-muted-foreground" style={tajawal}>
                  {deleteHint}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className={ds.btnRound}
                  style={tajawal}
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className={ds.btnRound}
                  style={tajawal}
                  disabled={busy}
                  onClick={() => void runDelete()}
                >
                  نعم، احذف
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
