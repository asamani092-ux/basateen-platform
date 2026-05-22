import { useEffect, useState, type ReactNode } from "react";
import { CircleDot, Percent, Users } from "lucide-react";
import { api, type TvSummary } from "../../lib/api-client";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;
const REFRESH_MS = 30_000;

export function TvLivePage() {
  const [summary, setSummary] = useState<TvSummary | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.tvSummary();
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "تعذّر تحميل البيانات");
        }
      }
    }

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const timeStr = clock.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateStr = clock.toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="min-h-screen min-h-[100dvh] w-full bg-gradient-to-br from-[#0a1628] via-[#132337] to-[#1e3a8a] text-white overflow-hidden"
      dir="rtl"
    >
      <div className="h-full flex flex-col p-6 sm:p-10 lg:p-14 max-w-[3840px] mx-auto">
        <header className="flex flex-wrap items-center justify-between gap-6 mb-8 lg:mb-12">
          <div className="flex items-center gap-6">
            <img
              src="/logo-dark.png"
              alt="مجمع حلقات البساتين"
              className="h-16 sm:h-24 lg:h-32 w-auto object-contain"
            />
            <div>
              <h1
                className="text-2xl sm:text-4xl lg:text-5xl font-bold text-white"
                style={tajawal}
              >
                مجمع حلقات البساتين
              </h1>
              <p
                className="text-lg sm:text-2xl text-blue-200 mt-1"
                style={tajawal}
              >
                لوحة العرض — يوم الهمة والحضور
              </p>
            </div>
          </div>
          <div className="text-left" dir="ltr">
            <p className="text-3xl sm:text-5xl lg:text-6xl font-bold tabular-nums">
              {timeStr}
            </p>
            <p className="text-sm sm:text-xl text-blue-200 mt-1" style={tajawal}>
              {dateStr}
            </p>
          </div>
        </header>

        {error && (
          <div
            className="rounded-2xl border border-rose-400/40 bg-rose-950/40 px-6 py-4 text-rose-200 text-lg mb-8"
            style={tajawal}
          >
            {error}
          </div>
        )}

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-10">
          <TvStat
            icon={<Users className="w-10 h-10 sm:w-14 sm:h-14" />}
            label="الحضور"
            value={summary?.present ?? "—"}
            accent="from-emerald-600/40 to-emerald-900/20"
          />
          <TvStat
            icon={<Users className="w-10 h-10 sm:w-14 sm:h-14 text-rose-300" />}
            label="الغياب"
            value={summary?.absent ?? "—"}
            accent="from-rose-600/40 to-rose-900/20"
          />
          <TvStat
            icon={<Percent className="w-10 h-10 sm:w-14 sm:h-14" />}
            label="نسبة الحضور"
            value={summary ? `${summary.attendance_rate}%` : "—"}
            accent="from-blue-600/40 to-blue-900/20"
          />
          <TvStat
            icon={<CircleDot className="w-10 h-10 sm:w-14 sm:h-14" />}
            label="حلقات نشطة"
            value={summary?.active_circles ?? "—"}
            accent="from-amber-600/40 to-amber-900/20"
          />
        </div>

        <footer className="mt-auto pt-8 flex flex-wrap justify-between gap-4 text-blue-200/80 text-sm sm:text-lg">
          <span style={tajawal}>
            {summary?.complex ?? "مجمع حلقات البساتين"}
          </span>
          <span style={tajawal}>
            تحديث تلقائي كل {REFRESH_MS / 1000} ثانية
            {summary?.date ? ` · لقطة: ${summary.date}` : ""}
          </span>
        </footer>
      </div>
    </div>
  );
}

function TvStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div
      className={`rounded-3xl lg:rounded-[2rem] border border-white/10 bg-gradient-to-br ${accent} backdrop-blur-sm p-8 sm:p-10 lg:p-12 flex flex-col justify-between min-h-[180px] sm:min-h-[220px] lg:min-h-[280px]`}
    >
      <div className="text-blue-200 mb-4">{icon}</div>
      <div>
        <p className="text-xl sm:text-2xl lg:text-3xl text-blue-100" style={tajawal}>
          {label}
        </p>
        <p
          className="text-5xl sm:text-7xl lg:text-8xl font-bold mt-2 lg:mt-4 tabular-nums text-white"
          style={tajawal}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
