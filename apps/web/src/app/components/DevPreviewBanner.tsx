import { isUiDevPreview } from "../lib/dev-preview";
import { ds, tajawal } from "../lib/design-system";

export function DevPreviewBanner() {
  if (!isUiDevPreview()) return null;
  return (
    <div
      className="mb-4 rounded-2xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm text-amber-950 dark:text-amber-100"
      style={tajawal}
      role="status"
    >
      <strong>وضع معاينة الواجهة</strong> — بيانات وهمية محلياً (VITE_UI_DEV). الحفظ
      الحقيقي يتطلب نشر Worker وترحيلات D1.
    </div>
  );
}
