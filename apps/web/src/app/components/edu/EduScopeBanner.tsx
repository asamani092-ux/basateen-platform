import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { stageLabel } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";

export function EduScopeBanner() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseApi()) {
      setLabel("معاينة — نطاق ابتدائي (تجريبي)");
      return;
    }
    api
      .eduScope()
      .then((res) => {
        const sc = res.scope as { type?: string; stageIds?: number[] };
        if (sc?.type === "global") setLabel("نطاقك: كل المجمع");
        else if (sc?.stageIds?.length) {
          setLabel(`نطاقك: ${sc.stageIds.map((id) => stageLabel(id)).join("، ")}`);
        }
      })
      .catch(() => setLabel(null));
  }, []);

  if (!label) return null;

  return (
    <p className={`text-sm ${ds.alert.info} py-2 px-3 rounded-xl`} style={tajawal}>
      {label} — تُعرض البيانات ضمن مرحلتك فقط
    </p>
  );
}
