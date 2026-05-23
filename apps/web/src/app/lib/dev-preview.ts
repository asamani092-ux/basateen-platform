/**
 * وضع معاينة الواجهة محلياً بدون الاعتماد على Worker/D1.
 * فعّل عبر: VITE_UI_DEV=true في apps/web/.env.development.local
 */
export function isUiDevPreview(): boolean {
  return import.meta.env.VITE_UI_DEV === "true";
}

export const DEV_PREVIEW_TOKEN = "ui-dev-preview-token";
