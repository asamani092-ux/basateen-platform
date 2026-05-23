import { getApiToken } from "./api-token";
import { isUiDevPreview } from "./dev-preview";

/** وضع المعاينة أو جلسة API حقيقية */
export function canUseApi(): boolean {
  return isUiDevPreview() || Boolean(getApiToken());
}
