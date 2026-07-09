import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

export type RecitationHubTab<T extends string> = {
  id: T;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  panel: ReactNode;
};

type Props<T extends string> = {
  title: string;
  description: string;
  navAriaLabel: string;
  tabs: RecitationHubTab<T>[];
  defaultTab: T;
  parseTab: (raw: string | null) => T;
};

export function RecitationHubShell<T extends string>({
  title,
  description,
  navAriaLabel,
  tabs,
  defaultTab,
  parseTab,
}: Props<T>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  function setTab(next: T) {
    setSearchParams(next === defaultTab ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className={cn(ds.pageShell, "pb-24 md:pb-6")} dir="rtl">
      <header className="space-y-1">
        <h1 className={ds.page.title} style={tajawal}>
          {title}
        </h1>
        <p className={ds.page.description} style={tajawal}>
          {description}
        </p>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(parseTab(v))}
        className="w-full"
        dir="rtl"
      >
        <TabsList className={cn(ds.hubTabsList, "hidden md:flex")}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className={ds.hubTabTrigger} style={tajawal}>
              <Icon className="size-4 ml-1.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(({ id, panel }) => (
          <TabsContent
            key={id}
            value={id}
            forceMount
            className="mt-0 md:mt-4 focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {panel}
          </TabsContent>
        ))}
      </Tabs>

      <nav className={ds.hubBottomNav} aria-label={navAriaLabel} dir="rtl">
        <div className={ds.hubBottomNavInner}>
          {tabs.map(({ id, shortLabel, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(ds.hubBottomNavBtn, active && ds.hubBottomNavBtnActive)}
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
