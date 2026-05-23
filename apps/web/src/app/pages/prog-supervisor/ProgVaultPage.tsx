import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function ProgVaultPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [fileKind, setFileKind] = useState("drive");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    try {
      const res = await api.progVaultList(q);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function addItem() {
    if (!titleAr.trim() || !url.trim()) {
      setError("العنوان والرابط مطلوبان");
      return;
    }
    setError(null);
    try {
      await api.progVaultCreate({
        title_ar: titleAr.trim(),
        description_ar: description.trim() || null,
        external_url: url.trim(),
        file_kind: fileKind,
        program_year: year,
        tags: [],
      });
      setTitleAr("");
      setDescription("");
      setUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    }
  }

  async function archive(id: number) {
    await api.progVaultArchive(id);
    await load();
  }

  return (
    <div className="space-y-6">
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>إضافة إلى بنك المعرفة</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Input
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
            placeholder="اسم الحقيبة / النشاط"
            className={ds.btnRound}
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="رابط خارجي (Drive, YouTube…)"
            className={ds.btnRound}
            dir="ltr"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف مختصر"
            className={`${ds.btnRound} sm:col-span-2`}
          />
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={ds.btnRound}
          />
          <select
            className={`${ds.btnRound} border border-border bg-background px-3 py-2`}
            value={fileKind}
            onChange={(e) => setFileKind(e.target.value)}
            style={tajawal}
          >
            <option value="drive">Google Drive</option>
            <option value="youtube">YouTube</option>
            <option value="link">رابط عام</option>
            <option value="pdf">PDF</option>
            <option value="image">صورة</option>
          </select>
          <Button
            type="button"
            className={`${ds.btnRound} sm:col-span-2`}
            onClick={addItem}
            style={tajawal}
          >
            حفظ في الأرشيف
          </Button>
        </CardContent>
      </Card>

      <div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث في الأرشيف…"
          className={ds.btnRound}
        />
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>المستودع</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm" style={tajawal}>
              لا عناصر مطابقة.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={String(item.id)}
                className="flex flex-wrap justify-between gap-2 border-b py-2"
              >
                <div>
                  <p className="font-semibold" style={tajawal}>
                    {String(item.title_ar)}
                  </p>
                  <p className="text-xs text-muted-foreground" style={tajawal}>
                    {String(item.program_year)} · {String(item.file_kind)}
                  </p>
                  <a
                    href={String(item.external_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline"
                    dir="ltr"
                  >
                    {String(item.external_url)}
                  </a>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={ds.btnRound}
                  onClick={() => archive(Number(item.id))}
                  style={tajawal}
                >
                  أرشفة
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
