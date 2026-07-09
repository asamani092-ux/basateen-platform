import { History } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onViewLedger: () => void;
  loading?: boolean;
};

export function RetroactiveAttendanceAccordion({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onViewLedger,
  loading,
}: Props) {
  return (
    <Accordion type="single" collapsible className={ds.card}>
      <AccordionItem value="retro" className="border-0 px-4">
        <AccordionTrigger className="hover:no-underline py-4" style={tajawal}>
          <span className="flex items-center gap-2 font-semibold">
            <History className="w-4 h-4 text-muted-foreground" />
            تعديل سجلات حضور سابقة
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label className="text-xs text-muted-foreground" style={tajawal}>
                من تاريخ
              </Label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground" style={tajawal}>
                إلى تاريخ
              </Label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
              />
            </div>
            <Button
              type="button"
              className={`${ds.btnRound} min-h-11 w-full sm:w-auto`}
              disabled={loading || !startDate || !endDate}
              onClick={onViewLedger}
              style={tajawal}
            >
              عرض السجل
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
