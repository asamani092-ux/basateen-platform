import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";

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

type CompetitionKpis = {
  discipline_pct: number;
  achievement_pct: number;
  participants: number;
  target_juz?: number;
  read_faces?: number;
  mastery_pct?: number;
};

type CompetitionLeader = {
  student_id: number;
  full_name_ar?: string | null;
  achievement_pct?: number;
  mastery_pct?: number;
  overall_pct?: number;
};

type CarouselSlide =
  | { kind: "kpi"; id: number; duration_seconds: number; metrics: MetricsPayload }
  | {
      kind: "competition";
      id: number;
      duration_seconds: number;
      name_ar: string;
      kpis: CompetitionKpis;
      leaders: CompetitionLeader[];
    }
  | {
      kind: "image" | "gif" | "video";
      id: number;
      duration_seconds: number;
      media_url: string;
    };

function slideDurationSec(slide: CarouselSlide | undefined, fallback: number): number {
  if (!slide) return fallback;
  return Math.max(3, slide.duration_seconds ?? fallback);
}

export function PublicLiveDisplayPage() {
  const [complexName, setComplexName] = useState("مجمع حلقات بساتين");
  const [slideSeconds, setSlideSeconds] = useState(12);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const advanceLockRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSlideTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advanceSlide = useCallback(() => {
    if (advanceLockRef.current) return;
    advanceLockRef.current = true;
    clearSlideTimer();
    setSlideIndex((i) => (slides.length > 0 ? (i + 1) % slides.length : 0));
  }, [clearSlideTimer, slides.length]);

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
        const nextSlides = res.slides as CarouselSlide[];
        setSlides(nextSlides);
        setSlideIndex((i) => (nextSlides.length ? Math.min(i, nextSlides.length - 1) : 0));
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
    advanceLockRef.current = false;
    clearSlideTimer();
    if (slides.length <= 1) return;

    const current = slides[slideIndex];

    if (current?.kind === "video") {
      // فيديو: التقدم عبر onEnded/onError فقط — لا مؤقت مدة (CMD-25)
      return;
    }

    const ms = slideDurationSec(current, slideSeconds) * 1000;
    timerRef.current = setTimeout(() => advanceSlide(), ms);
    return () => clearSlideTimer();
  }, [slideIndex, slides, slideSeconds, advanceSlide, clearSlideTimer]);

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
    if (!current || current.kind !== "kpi") return [];
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

  const competitionKpiCards = useMemo(() => {
    if (!current || current.kind !== "competition") return [];
    const k = current.kpis;
    return [
      { label: "نسبة الانضباط", value: `${k.discipline_pct}%` },
      { label: "نسبة الإنجاز", value: `${k.achievement_pct}%` },
      { label: "المشاركون", value: k.participants },
      ...(k.mastery_pct != null ? [{ label: "نسبة الإتقان", value: `${k.mastery_pct}%` }] : []),
      ...(k.read_faces != null ? [{ label: "الأوجه المقروءة", value: k.read_faces }] : []),
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

        {current?.kind === "kpi" && (
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

        {current?.kind === "competition" && (
          <div className="w-full max-w-6xl space-y-6 animate-in fade-in duration-500">
            <h2 className="text-3xl sm:text-5xl font-bold text-center" style={tajawal}>
              {current.name_ar}
            </h2>
            <div className={`${ds.kpiStrip} gap-4`}>
              {competitionKpiCards.map((c) => (
                <div
                  key={c.label}
                  className="rounded-3xl bg-white/10 backdrop-blur border border-white/20 p-5 text-right"
                >
                  <p className="text-white/90 text-sm" style={tajawal}>
                    {c.label}
                  </p>
                  <p className="text-3xl sm:text-4xl font-bold tabular-nums mt-1">{c.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl bg-white/10 backdrop-blur border border-white/20 p-6">
              <h3 className="text-xl font-bold mb-4 text-right" style={tajawal}>
                أفضل 5 طلاب
              </h3>
              <div className="space-y-3">
                {current.leaders.slice(0, 5).map((l, idx) => (
                  <div
                    key={l.student_id}
                    className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3"
                  >
                    <span className="text-2xl font-bold tabular-nums text-white/70">{idx + 1}</span>
                    <span className="flex-1 text-right text-lg font-semibold" style={tajawal}>
                      {l.full_name_ar ?? "—"}
                    </span>
                    <span className="text-lg font-bold tabular-nums">
                      {l.mastery_pct ?? l.achievement_pct ?? l.overall_pct ?? 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {current && (current.kind === "image" || current.kind === "gif" || current.kind === "video") && (
          <div className="w-full max-w-6xl flex items-center justify-center animate-in fade-in duration-500">
            {current.kind === "video" ? (
              <video
                key={current.id}
                src={current.media_url}
                className="max-h-[75vh] w-full object-contain rounded-2xl shadow-2xl"
                autoPlay
                muted
                playsInline
                preload="auto"
                onEnded={advanceSlide}
                onError={advanceSlide}
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
                key={`${s.kind}-${s.id}`}
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
