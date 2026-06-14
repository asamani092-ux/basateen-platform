import { useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

const SMART_VARIABLES = [
  { token: "{{اسم_الطالب}}", hint: "اسم الطالب" },
  { token: "{{الحلقة_أو_المسار}}", hint: "اسم الحلقة أو المسار" },
  { token: "{{التاريخ}}", hint: "تاريخ الغياب" },
] as const;

const DEFAULT_TEMPLATE =
  "السلام عليكم، نود إبلاغكم بغياب الطالب {{اسم_الطالب}} عن {{الحلقة_أو_المسار}} يوم {{التاريخ}}.";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTemplate?: string;
  onSaved?: (template: string) => void;
};

export function AbsentWhatsappTemplateDialog({
  open,
  onOpenChange,
  initialTemplate,
  onSaved,
}: Props) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTemplate(initialTemplate?.trim() || DEFAULT_TEMPLATE);
  }, [open, initialTemplate]);

  async function copyVariable(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      toast.success("تم نسخ المتغير");
    } catch {
      toast.error("تعذّر نسخ المتغير");
    }
  }

  async function handleSave() {
    const trimmed = template.trim();
    if (!trimmed) {
      toast.error("اكتب نص القالب قبل الحفظ");
      return;
    }
    if (!canUseApi()) {
      toast.error("أعد تسجيل الدخول");
      return;
    }

    setSaving(true);
    try {
      const res = await api.adminDeptSaveAbsentWhatsappTemplate(trimmed);
      onSaved?.(res.template);
      toast.success("تم حفظ القالب الافتراضي");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل حفظ القالب");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.dialog} max-w-3xl`} dir="rtl">
        <DialogHeader>
          <DialogTitle style={tajawal}>تخصيص قالب رسالة الغياب</DialogTitle>
          <DialogDescription style={tajawal}>
            عدّل نص الرسالة الافتراضية المرسلة لولي الأمر عبر واتساب. استخدم
            المتغيرات الذكية لإدراج البيانات تلقائياً.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1fr_min(16rem,100%)]">
          <div className="space-y-2">
            <Label htmlFor="whatsapp-template" style={tajawal}>
              نص القالب
            </Label>
            <Textarea
              id="whatsapp-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={10}
              disabled={saving}
              className="min-h-[14rem] w-full rounded-xl border border-input bg-input-background px-3 py-2 text-sm leading-relaxed text-foreground shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              style={tajawal}
              dir="rtl"
            />
          </div>

          <aside
            className={`${ds.card} space-y-3 p-4 h-fit`}
            aria-label="المتغيرات الذكية"
          >
            <p className="text-sm font-semibold text-foreground" style={tajawal}>
              المتغيرات الذكية
            </p>
            <p className="text-xs text-muted-foreground" style={tajawal}>
              انقر لنسخ المتغير ولصقه في القالب.
            </p>
            <ul className="space-y-2">
              {SMART_VARIABLES.map((v) => (
                <li key={v.token}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void copyVariable(v.token)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-right transition-colors hover:bg-muted disabled:opacity-50"
                    style={tajawal}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-primary" dir="ltr">
                        {v.token}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {v.hint}
                      </span>
                    </span>
                    <Copy className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            className={`${ds.btnRound} ${ds.primaryActionBtn}`}
            disabled={saving}
            onClick={() => void handleSave()}
            style={tajawal}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {saving ? "جاري الحفظ…" : "حفظ القالب الافتراضي"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
