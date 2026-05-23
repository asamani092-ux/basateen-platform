import { useEffect, useState } from "react";
import { Award, GraduationCap } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { api } from "../../lib/api-client";
import { getAlumniCache, setAlumniCache } from "../../lib/alumni-cache";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";

type Props = { editable?: boolean };

export function AlumniStatsCard({ editable = false }: Props) {
  const [graduates, setGraduates] = useState(0);
  const [huffadh, setHuffadh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const cached = getAlumniCache();
    setGraduates(cached.graduates_count);
    setHuffadh(cached.huffadh_count);
    if (!getApiToken()) return;
    api
      .complexSettings()
      .then((r) => {
        setGraduates(r.graduates_count);
        setHuffadh(r.huffadh_count);
        setAlumniCache({
          graduates_count: r.graduates_count,
          huffadh_count: r.huffadh_count,
        });
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    setAlumniCache({ graduates_count: graduates, huffadh_count: huffadh });
    try {
      if (getApiToken()) {
        await api.patchComplexSettings({
          graduates_count: graduates,
          huffadh_count: huffadh,
        });
      }
      setMsg("تم الحفظ");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base" style={tajawal}>
            <GraduationCap className="w-5 h-5 text-primary" />
            الخريجون
          </CardTitle>
          <CardDescription style={tajawal}>
            إدخال تراكمي لعدد خريجي المجمع سابقاً
          </CardDescription>
        </CardHeader>
        <CardContent>
          {editable ? (
            <Input
              type="number"
              min={0}
              value={graduates}
              onChange={(e) => setGraduates(Number(e.target.value))}
              className={ds.btnRound}
            />
          ) : (
            <p className="text-3xl font-bold text-foreground" style={tajawal}>
              {graduates}
            </p>
          )}
        </CardContent>
      </Card>
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base" style={tajawal}>
            <Award className="w-5 h-5 text-primary" />
            الحفاظ
          </CardTitle>
          <CardDescription style={tajawal}>
            عدد حفاظ المجمع المسجّل
          </CardDescription>
        </CardHeader>
        <CardContent>
          {editable ? (
            <Input
              type="number"
              min={0}
              value={huffadh}
              onChange={(e) => setHuffadh(Number(e.target.value))}
              className={ds.btnRound}
            />
          ) : (
            <p className="text-3xl font-bold text-foreground" style={tajawal}>
              {huffadh}
            </p>
          )}
        </CardContent>
      </Card>
      {editable && (
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button
            type="button"
            className={ds.btnRound}
            disabled={saving}
            onClick={save}
            style={tajawal}
          >
            {saving ? "جاري الحفظ..." : "حفظ الأرقام"}
          </Button>
          {msg && (
            <span className="text-sm text-muted-foreground" style={tajawal}>
              {msg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
