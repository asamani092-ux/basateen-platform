import { useState } from "react";
import { Button } from "../../components/ui/button";
import { CompetitionsPage } from "./CompetitionsPage";
import { YomHimmaPage } from "./YomHimmaPage";
import { ds, tajawal } from "../../lib/design-system";

type EventTab = "competitions" | "himma";

export function EventsEngineConsole() {
  const [tab, setTab] = useState<EventTab>("competitions");

  return (
    <section className="space-y-4">
      <header>
        <h2 className={ds.page.title} style={tajawal}>
          محرك الفعاليات (المنافسات + أيام الهمة)
        </h2>
        <p className={ds.page.description} style={tajawal}>
          إدارة الفعاليات بزمن وPIN مع عزل السياق الإحصائي للفعالية عن رصد الحلقة اليومية.
        </p>
      </header>
      <div className="flex gap-2">
        <Button
          type="button"
          className={ds.btnRound}
          variant={tab === "competitions" ? "default" : "outline"}
          onClick={() => setTab("competitions")}
          style={tajawal}
        >
          المسابقات
        </Button>
        <Button
          type="button"
          className={ds.btnRound}
          variant={tab === "himma" ? "default" : "outline"}
          onClick={() => setTab("himma")}
          style={tajawal}
        >
          أيام الهمة
        </Button>
      </div>
      {tab === "competitions" ? <CompetitionsPage /> : <YomHimmaPage />}
    </section>
  );
}
