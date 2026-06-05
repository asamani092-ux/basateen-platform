import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { ds, tajawal } from "../../lib/design-system";
import type { DateFilterMode } from "../../lib/attendance-ledger";

type Props = {
  mode: DateFilterMode;
  onModeChange: (mode: DateFilterMode) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
};

export function AttendanceDateFilter({
  mode,
  onModeChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "day" ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => onModeChange("day")}
          style={tajawal}
        >
          يوم محدد
        </Button>
        <Button
          type="button"
          variant={mode === "range" ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => onModeChange("range")}
          style={tajawal}
        >
          نطاق زمني
        </Button>
      </div>

      {mode === "day" ? (
        <div>
          <Label className="text-xs text-muted-foreground" style={tajawal}>
            تاريخ التحضير
          </Label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              onStartDateChange(e.target.value);
              onEndDateChange(e.target.value);
            }}
            className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
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
        </div>
      )}
    </div>
  );
}
