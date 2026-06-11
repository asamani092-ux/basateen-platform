import {
  formatFacesToText,
  facesToStructuredInput,
  type QuranUnit,
} from "../../lib/quran-memorization";
import { ds, tajawal } from "../../lib/design-system";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export type MemorizationProfileData = {
  faces: number | null;
  text: string | null;
  structured?: { value: string; unit: QuranUnit };
};

type Props = {
  data: MemorizationProfileData | null;
  loading?: boolean;
  title?: string;
};

/** O(1) — عرض قراءة فقط */
export function MemorizationProfileCard({
  data,
  loading,
  title = "المحفوظ التراكمي",
}: Props) {
  if (loading) {
    return (
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        </CardContent>
      </Card>
    );
  }

  const faces = data?.faces ?? 0;
  const text = data?.text?.trim() || (faces > 0 ? formatFacesToText(faces) : "");
  const structured =
    data?.structured ??
    (faces > 0 ? facesToStructuredInput(faces) : { value: "", unit: "face" as const });

  return (
    <Card className={ds.card}>
      <CardHeader>
        <CardTitle style={tajawal}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm" style={tajawal}>
        {faces <= 0 && !text ? (
          <p className="text-muted-foreground">لم يُسجّل محفوظ بعد.</p>
        ) : (
          <>
            <p className="text-lg font-semibold text-primary">{text || "—"}</p>
            <p className="text-xs text-muted-foreground">
              {faces > 0
                ? `${faces} وجه مطلق · يُعرض بصيغة قرآنية (جزء / حزب / وجه)`
                : "—"}
            </p>
            {structured.value ? (
              <p className="text-xs text-muted-foreground">
                إدخال منظم: {structured.value}{" "}
                {structured.unit === "juz"
                  ? "جزء"
                  : structured.unit === "hizb"
                    ? "حزب"
                    : "وجه"}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
