import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api-client";
import { tajawal } from "../../lib/design-system";

type MetricsPayload = {
  attendance_present_today: number;
  attendance_absent_today: number;
  faces_cumulative: number;
  active_pledges: number;
  total_circles: number;
  total_tracks: number;
  total_students: number;
  students_by_stage: Array<{ stage_id: number; label: string; count: number }>;
};

type CarouselSlide =
  | { kind: "metrics"; id: string; metrics: MetricsPayload }
  | { kind: "image" | "gif" | "video"; id: number; media_url: string };

export function PublicLiveDisplayPage() {
  const [complexName, setComplexName] = useState("مجمع حلقات بساتين");
  const [slideSeconds, setSlideSeconds] = useState(12);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.publicLiveDisplayCarousel();
        if (cancelled) return;
        setComplexName(res.complex_name);
        setSlideSeconds(res.slide_seconds);
        setSlides(res.slides as CarouselSlide[]);
      } catch {
        /* keep last */
      }
    }
    void load();
    const interval = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (slides.length <= 1 || current?.kind === "video") return;
    const ms = Math.max(3, slideSeconds) * 1000;
    const t = setInterval(
      () => setSlideIndex((i) => (i + 1) % slides.length),
      ms,
    );
    return () => clearInterval(t);
  }, [current?.kind, slides.length, slideSeconds]);

  const current = slides[slideIndex];
  const timeStr = clock.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = clock.toLocaleDateString("ar-SA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const metricCards = useMemo(() => {
    if (!current || current.kind !== "metrics") return [];
    const m = current.metrics;
    return [
      { label: "حضور اليوم", value: m.attendance_present_today },
      { label: "غياب اليوم", value: m.attendance_absent_today },
      { label: "الأوجه التراكمية", value: m.faces_cumulative },
      { label: "عدد الحلقات", value: m.total_circles },
      { label: "عدد المسارات", value: m.total_tracks },
      { label: "إجمالي الطلاب", value: m.total_students },
    ];
  }, [current]);

  return (
    <div
      dir="rtl"
      className="min-h-screen min-h-[100dvh] w-full overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#312e81] text-white"
    >
      <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
        <div className="text-right">
          <h1 className="text-2xl sm:text-4xl font-bold" style={tajawal}>
            {complexName}
          </h1>
          <p className="text-blue-200 text-sm sm:text-lg mt-1" style={tajawal}>
            {dateStr} — {timeStr}
          </p>
        </div>
        <img src="/logo-dark.png" alt="" className="h-12 sm:h-20 object-contain" />
      </header>

      <main className="flex flex-col items-center justify-center min-h-[calc(100dvh-5rem)] p-6">
        {!current && (
          <p className="text-white/60 text-center" style={tajawal}>
            جاري تحميل شاشة العرض…
          </p>
        )}

        {current?.kind === "metrics" && (
          <div className="w-full max-w-6xl space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {metricCards.map((c) => (
                <div
                  key={c.label}
                  className="rounded-3xl bg-white/10 backdrop-blur border border-white/20 p-6 sm:p-8 text-right"
                >
                  <p className="text-white/90 text-sm sm:text-base" style={tajawal}>
                    {c.label}
                  </p>
                  <p className="text-4xl sm:text-6xl font-bold tabular-nums mt-2">{c.value}</p>
                </div>
              ))}
            </div>
            {current.metrics.students_by_stage.length > 0 && (
              <div className="rounded-3xl bg-white/10 backdrop-blur border border-white/20 p-6">
                <h2 className="text-xl font-bold mb-4 text-right" style={tajawal}>
                  الطلاب حسب المرحلة
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {current.metrics.students_by_stage.map((s) => (
                    <div key={s.stage_id} className="text-center rounded-2xl bg-black/20 p-4">
                      <p className="text-sm text-white/80" style={tajawal}>
                        {s.label}
                      </p>
                      <p className="text-3xl font-bold tabular-nums">{s.count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {current && current.kind !== "metrics" && (
          <div className="w-full max-w-6xl flex items-center justify-center animate-in fade-in duration-500">
            {current.kind === "video" ? (
              <video
                key={current.id}
                src={current.media_url}
                className="max-h-[75vh] w-full object-contain rounded-2xl shadow-2xl"
                autoPlay
                muted
                playsInline
                onEnded={() => setSlideIndex((i) => (i + 1) % slides.length)}
              />
            ) : (
              <img
                key={current.id}
                src={current.media_url}
                alt=""
                className="max-h-[75vh] w-full object-contain rounded-2xl shadow-2xl"
              />
            )}
          </div>
        )}

        {slides.length > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            {slides.map((s, i) => (
              <span
                key={String(s.kind === "metrics" ? s.id : s.id)}
                className={`h-2 rounded-full transition-all ${
                  i === slideIndex ? "w-8 bg-white" : "w-2 bg-white/40"
                }`}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
