import { Button } from "../ui/button";
import { ds, tajawal } from "../../lib/design-system";

export type HubTab = { id: string; label: string };

type HubTabsProps = {
  tabs: HubTab[];
  active: string;
  onChange: (id: string) => void;
};

export function HubTabs({ tabs, active, onChange }: HubTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          type="button"
          size="sm"
          variant={active === tab.id ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => onChange(tab.id)}
          style={tajawal}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}
