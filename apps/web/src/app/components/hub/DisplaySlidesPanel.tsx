import { useEffect, useState } from "react";
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
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";

type Slide = { url: string; caption?: string };

export function DisplaySlidesPanel() {
  const [mode, setMode] = useState<"static" | "carousel">("carousel");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!getApiToken()) return;
    api.complexSettings().then((r) => {
      setMode((r.display_mode as "static" | "carousel") || "carousel");
      setSlides((r.slides as Slide[]) ?? []);
    }).catch(() => {});
  }, []);

  async function save() {
    if (!getApiToken()) return;
    await api.patchComplexSettings({ display_mode: mode, slides });
  }

  function addSlide() {
    if (!url.trim()) return;
    setSlides((s) => [...s, { url: url.trim() }]);
    setUrl("");
  }

  return (
    <Card className={ds.card}>
      <CardHeader>
        <CardTitle style={tajawal}>الشاشات العامة</CardTitle>
        <CardDescription style={tajawal}>
          صور أو فيديو — عرض ثابت أو متحرك على التلفاز واللوحات
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "carousel" ? "default" : "outline"}
            className={ds.btnRound}
            onClick={() => setMode("carousel")}
            style={tajawal}
          >
            متحرك
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "static" ? "default" : "outline"}
            className={ds.btnRound}
            onClick={() => setMode("static")}
            style={tajawal}
          >
            ثابت
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="رابط صورة أو فيديو"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={ds.btnRound}
            dir="ltr"
          />
          <Button type="button" className={ds.btnRound} onClick={addSlide} style={tajawal}>
            إضافة
          </Button>
        </div>
        <ul className="text-sm space-y-1 text-muted-foreground" style={tajawal}>
          {slides.map((s, i) => (
            <li key={i} className="truncate">
              {s.url}
            </li>
          ))}
        </ul>
        <Button type="button" className={ds.btnRound} onClick={save} style={tajawal}>
          حفظ الإعدادات
        </Button>
      </CardContent>
    </Card>
  );
}
