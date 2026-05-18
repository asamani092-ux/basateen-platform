import { useEffect, useState, type ReactNode } from "react";
import { Users, CircleDot, Percent, Wifi } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { api, type TvSummary } from "../lib/api-client";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function HomePage() {
  const [summary, setSummary] = useState<TvSummary | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await api.health();
        if (!cancelled) setApiOk(true);
        const data = await api.tvSummary();
        if (!cancelled) setSummary(data);
      } catch (e) {
        if (!cancelled) {
          setApiOk(false);
          setError(e instanceof Error ? e.message : "فشل الاتصال بالـ API");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white" style={tajawal}>
            لوحة التحكم
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mt-1" style={tajawal}>
            مجمع حلقات البساتين — مؤشرات اليوم
          </p>
        </div>
        <Badge
          variant={apiOk ? "default" : "destructive"}
          className="rounded-xl px-3 py-1"
          style={tajawal}
        >
          <Wifi className="w-3 h-3 ml-1" />
          {apiOk === null ? "جاري الاتصال..." : apiOk ? "API متصل" : "API غير متصل"}
        </Badge>
      </div>

      {error && (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 p-4 text-rose-800 dark:text-rose-300 text-sm"
          style={tajawal}
        >
          {error}. أنشئ ملف <code className="font-mono">apps/web/.env</code> يحتوي{" "}
          <code className="font-mono">VITE_API_URL=https://YOUR-WORKER.workers.dev</code> ثم أعد تشغيل{" "}
          <code className="font-mono">npm run dev</code>.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          icon={<Users className="w-6 h-6" />}
          label="الحضور"
          value={summary?.present ?? "—"}
        />
        <StatCard
          icon={<Users className="w-6 h-6 text-rose-500" />}
          label="الغياب"
          value={summary?.absent ?? "—"}
        />
        <StatCard
          icon={<Percent className="w-6 h-6" />}
          label="نسبة الحضور"
          value={summary ? `${summary.attendance_rate}%` : "—"}
        />
        <StatCard
          icon={<CircleDot className="w-6 h-6" />}
          label="حلقات نشطة"
          value={summary?.active_circles ?? "—"}
        />
      </div>

      <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f] shadow-sm">
        <CardHeader>
          <CardTitle style={tajawal}>الأقسام</CardTitle>
          <CardDescription style={tajawal}>
            اختر من القائمة الجانبية لبدء العمل على الوحدات الإدارية والتعليمية.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 dark:text-slate-300" style={tajawal}>
          القسم أ: الإدارة — القسم ب: التعليم — القسم د: البرامج والاختبارات.
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f] shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#dbeafe] dark:bg-[#1e3a5f] flex items-center justify-center text-[#1e3a8a] dark:text-[#3b82f6]">
            {icon}
          </div>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400" style={tajawal}>
          {label}
        </p>
        <p className="text-3xl font-bold mt-1 text-slate-900 dark:text-white" style={tajawal}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
