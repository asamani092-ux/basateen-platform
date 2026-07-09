import { Minus, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  computeSirdPeriodScore,
  type SirdPeriodData,
  type SirdSettings,
} from "../../lib/competition-engine";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  totalPeriods: number;
  activePeriod: number | null;
  periods: Record<number, SirdPeriodData>;
  settings: SirdSettings;
  disabled?: boolean;
  onSelectPeriod: (periodIndex: number) => void;
  onPatchPeriod: (periodIndex: number, patch: Partial<SirdPeriodData>) => void;
};

/** O(P) render — P = competition day count (typically ≤ 30). */
export function SirdPeriodGrid({
  totalPeriods,
  activePeriod,
  periods,
  settings,
  disabled,
  onSelectPeriod,
  onPatchPeriod,
}: Props) {
  const count = Math.max(1, Math.round(totalPeriods));
  const items = Array.from({ length: count }, (_, i) => i + 1);
  const active = activePeriod != null ? periods[activePeriod] : undefined;
  const computed =
    active != null
      ? computeSirdPeriodScore(
          active.mistakes_count,
          active.warnings_count,
          settings,
        )
      : null;

  return (
    <div className="space-y-4">
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(4.5rem, 1fr))",
        }}
      >
        {items.map((period) => {
          const data = periods[period];
          const hasData = data && Number(data.hizb_number) > 0;
          const passed = data?.is_passed;
          const isActive = activePeriod === period;
          return (
            <button
              key={period}
              type="button"
              disabled={disabled}
              onClick={() => onSelectPeriod(period)}
              className={`min-h-11 rounded-xl border text-xs font-semibold transition-colors touch-manipulation px-1 ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : hasData
                    ? passed
                      ? "bg-success-surface text-success-foreground border-success/40"
                      : "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-card hover:bg-muted border-border"
              }`}
              style={tajawal}
            >
              <span className="block">فترة {period}</span>
              {hasData && data.score != null ? (
                <span className="block text-[10px] font-normal tabular-nums">
                  {data.score}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activePeriod != null && (
        <div className="rounded-xl border p-4 space-y-4">
          <p className="font-semibold text-sm" style={tajawal}>
            فترة {activePeriod}
          </p>
          <div className="space-y-2">
            <Label style={tajawal}>رقم الحزب</Label>
            <Input
              type="number"
              min={0}
              step={1}
              disabled={disabled}
              value={active?.hizb_number ?? 0}
              onChange={(e) =>
                onPatchPeriod(activePeriod, {
                  hizb_number: Number(e.target.value),
                })
              }
              className={ds.btnRound}
            />
          </div>
          <CounterField
            label="الأخطاء"
            value={active?.mistakes_count ?? 0}
            disabled={disabled}
            onChange={(v) => onPatchPeriod(activePeriod, { mistakes_count: v })}
          />
          <CounterField
            label="التنبيهات"
            value={active?.warnings_count ?? 0}
            disabled={disabled}
            onChange={(v) => onPatchPeriod(activePeriod, { warnings_count: v })}
          />
          {computed && (
            <div
              className={`rounded-xl p-3 text-sm ${
                computed.is_passed
                  ? "bg-success-surface text-success-foreground border border-success/30"
                  : "bg-destructive/10 text-destructive border border-destructive/30"
              }`}
              style={tajawal}
            >
              <p className="font-semibold tabular-nums">
                الدرجة: {computed.score} / {settings.base_hizb_score}
              </p>
              <p>{computed.is_passed ? "مجتاز ✓" : "غير مجتاز ✗"}</p>
              <p className="text-xs mt-1 opacity-80">
                حد الاجتياز: {settings.pass_threshold}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CounterField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground mb-2 text-center" style={tajawal}>
        {label}
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-10 w-10 rounded-full"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <Minus className="w-5 h-5" />
        </Button>
        <span className="text-xl font-bold tabular-nums w-8 text-center">{value}</span>
        <Button
          type="button"
          size="icon"
          className="h-10 w-10 rounded-full"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
