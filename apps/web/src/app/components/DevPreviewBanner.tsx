import { isUiDevPreview } from "../lib/dev-preview";
import { ds, tajawal } from "../lib/design-system";

export function DevPreviewBanner() {
  if (!isUiDevPreview()) return null;
  return (
    <div className={`mb-4 ${ds.alert.warn}`} style={tajawal} role="status">
      <strong>وضع معاينة الواجهة</strong> — بيانات وهمية محلياً (VITE_UI_DEV). الحفظ
      الحقيقي يتطلب نشر Worker وترحيلات D1.
    </div>
  );
}
