import { useSearchParams } from "react-router";
import { BookOpen, ClipboardList, Trophy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { DailyRecitationPage } from "../edu-dept/DailyRecitationPage";
import { TeacherCompetitionsPage } from "../edu-dept/TeacherCompetitionsPage";
import { cn } from "../../components/ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type HubTab = "daily" | "plans" | "competitions";

const TAB_CONFIG: Array<{
  id: HubTab;
  label: string;
  shortLabel: string;
  icon: typeof ClipboardList;
}> = [
  { id: "daily", label: "الرصد اليومي", shortLabel: "الرصد", icon: ClipboardList },
  { id: "plans", label: "خطة الفصل", shortLabel: "الخطة", icon: BookOpen },
  {
    id: "competitions",
    label: "منافسات الحلقة",
    shortLabel: "المنافسات",
    icon: Trophy,
  },
];

function parseTab(raw: string | null): HubTab {
  if (raw === "plans" || raw === "competitions") return raw;
  return "daily";
}

function SemesterPlanPlaceholder() {
  return (
    <div
      className={`${ds.card} flex flex-col items-center justify-center gap-4 p-10 text-center`}
      dir="rtl"
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary/60 text-primary">
        <BookOpen className="size-8" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground" style={tajawal}>
          خطة الفصل
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm" style={tajawal}>
          ستتوفر هنا أهداف الحفظ والمراجعة لكل طالب — قريباً.
        </p>
      </div>
    </div>
  );
}

export function TeacherHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  function setTab(next: HubTab) {
    setSearchParams(next === "daily" ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className="space-y-4 pb-24 md:pb-6" dir="rtl">
      <header className="space-y-1">
        <h1 className={ds.page.title} style={tajawal}>
          بوابة المعلم
        </h1>
        <p className={ds.page.description} style={tajawal}>
          الرصد اليومي، خطط الفصل، ومنافسات حلقتك — من مكان واحد.
        </p>
      </header>

      {/* Desktop / tablet — top tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(parseTab(v))}
        className="hidden md:block w-full"
        dir="rtl"
      >
        <TabsList className="w-full justify-start gap-1 rounded-xl border border-border bg-muted/50 p-1 h-auto flex-wrap">
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className={cn(
                "rounded-lg px-4 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
              )}
              style={tajawal}
            >
              <Icon className="size-4 ml-1.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="daily" className="mt-4 focus-visible:outline-none">
          <DailyRecitationPage embedded />
        </TabsContent>
        <TabsContent value="plans" className="mt-4 focus-visible:outline-none">
          <SemesterPlanPlaceholder />
        </TabsContent>
        <TabsContent value="competitions" className="mt-4 focus-visible:outline-none">
          <TeacherCompetitionsPage />
        </TabsContent>
      </Tabs>

      {/* Mobile — panel + bottom navigation */}
      <div className="md:hidden space-y-4">
        {tab === "daily" && <DailyRecitationPage embedded />}
        {tab === "plans" && <SemesterPlanPlaceholder />}
        {tab === "competitions" && <TeacherCompetitionsPage />}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 md:hidden print:hidden"
        aria-label="تنقل بوابة المعلم"
        dir="rtl"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {TAB_CONFIG.map(({ id, shortLabel, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors touch-manipulation",
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
                style={tajawal}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("size-5 shrink-0", active && "text-primary")} />
                <span className="truncate">{shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
