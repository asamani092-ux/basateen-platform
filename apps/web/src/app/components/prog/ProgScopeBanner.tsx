import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function ProgScopeBanner() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseApi()) {
      setLabel("معاينة — نطاق البرامج (معزول عن الرصد القرآني)");
      return;
    }
    api
      .progScope()
      .then((r) => setLabel(r.scope_label ?? "كل المجمع"))
      .catch(() => {
        setLabel("كل المجمع");
      });
  }, []);

  if (!label) return null;

  return (
    <p className={`${ds.alert.info} text-sm`} style={tajawal}>
      نطاق العمل: <strong>{label}</strong> — بيانات البرامج والاختبارات منفصلة عن الرصد اليومي
      للمعلم.
    </p>
  );
}
