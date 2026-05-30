import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import { tajawal } from "../../lib/design-system";

const REFRESH_MS = 20_000;
const SLIDE_MS = 12_000;

type Metrics = {
  attendance_present_today: number;
  attendance_absent_today: number;
  faces_cumulative: number;
  active_pledges: number;
};

type MediaItem = {
  id: number;
  media_type: string;
  media_url: string;
};

export function PublicLiveDisplayPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [topStudents, setTopStudents] = useState<
    Array<{ full_name_ar: string; metric: number; label: string }>
  >([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [slide, setSlide] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const [complexName, setComplexName] = useState("مجمع حلقات البساتين");

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [m, med] = await Promise.all([
          api.publicLiveDisplayMetrics(),
          api.publicLiveDisplayMedia(),
        ]);
        if (cancelled) return;
        setComplexName(m.complex_name);
        setMetrics(m.metrics);
        setTopStudents(m.top_students ?? []);
        setMedia(med.items ?? []);
      } catch {
        /* keep last good state */
      }
    }
    void load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (media.length <= 1) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % media.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [media.length]);

  const current = media[slide];
  const timeStr = clock.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  const dateStr = clock.toLocaleDateString("ar-SA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const cards = metrics
    ? [
        { label: "حضور اليوم", value: metrics.attendance_present_today, color: "from-emerald-500 to-teal-600" },
        { label: "غياب اليوم", value: metrics.attendance_absent_today, color: "from-rose-500 to-orange-600" },
        { label: "الأوجه المقروءة (تراكمي)", value: metrics.faces_cumulative, color: "from-violet-500 to-indigo-600" },
        { label: "التعهدات النشطة", value: metrics.active_pledges, color: "from-amber-500 to-yellow-600" },
      ]
    : [];

  return (
    <div
      dir="rtl"
      className="min-h-screen min-h-[100dvh] w-full overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#312e81] text-white"
    >
      <div className="h-full min-h-[100dvh] grid grid-rows-[auto_1fr] lg:grid-rows-1 lg:grid-cols-[1fr_38%] gap-0">
        <main className="flex flex-col p-6 sm:p-10 lg:p-12 order-2 lg:order-1">
          <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl sm:text-5xl font-bold" style={tajawal}>
                {complexName}
              </h1>
              <p className="text-blue-200 text-lg mt-1" style={tajawal}>
                {dateStr} — {timeStr}
              </p>
            </div>
            <img src="/logo-dark.png" alt="" className="h-16 sm:h-24 object-contain" />
          </header>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 flex-1 content-start">
            {cards.map((c) => (
              <div
                key={c.label}
                className={`rounded-3xl bg-gradient-to-br ${c.color} p-5 sm:p-8 shadow-xl`}
              >
                <p className="text-white/90 text-sm sm:text-base" style={tajawal}>
                  {c.label}
                </p>
                <p className="text-4xl sm:text-6xl font-bold tabular-nums mt-2">{c.value}</p>
              </div>
            ))}
          </div>

          {topStudents.length > 0 && (
            <section className="mt-8 rounded-3xl bg-white/10 backdrop-blur border border-white/20 p-6">
              <h2 className="text-xl font-bold mb-4" style={tajawal}>
                الطلاب المتميزون
              </h2>
              <ul className="space-y-2">
                {topStudents.map((s, i) => (
                  <li
                    key={i}
                    className="flex justify-between items-center text-lg border-b border-white/10 pb-2 last:border-0"
                    style={tajawal}
                  >
                    <span>{s.full_name_ar}</span>
                    <span className="font-bold tabular-nums">
                      {s.metric} {s.label}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        <aside className="relative bg-black/40 min-h-[28vh] lg:min-h-[100dvh] order-1 lg:order-2 flex items-center justify-center overflow-hidden">
          {current ? (
            current.media_type === "video" ? (
              <video
                key={current.id}
                src={current.media_url}
                className="w-full h-full object-contain max-h-[40vh] lg:max-h-full"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img
                key={current.id}
                src={current.media_url}
                alt=""
                className="w-full h-full object-contain max-h-[40vh] lg:max-h-full p-4"
              />
            )
          ) : (
            <p className="text-white/60 p-8 text-center" style={tajawal}>
              لا توجد وسائط معروضة — أضفها من لوحة المشرف العام.
            </p>
          )}
          {media.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
              {media.map((m, i) => (
                <span
                  key={m.id}
                  className={`h-2 rounded-full transition-all ${
                    i === slide ? "w-8 bg-white" : "w-2 bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
