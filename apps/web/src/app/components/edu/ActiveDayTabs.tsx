import { formatActiveDayLabel } from "../../lib/competition-engine";
import { ds, tajawal } from "../../lib/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type Props = {
  activeDates: string[];
  selectedDate: string;
  onSelect: (isoDate: string) => void;
  disabled?: boolean;
  gradedDates?: string[];
};

/** قائمة منسدلة لأيام التسميع النشطة فقط — بدون أيام الإجازة */
export function ActiveDayTabs({
  activeDates,
  selectedDate,
  onSelect,
  disabled,
  gradedDates,
}: Props) {
  if (!activeDates.length) return null;

  const value = activeDates.includes(selectedDate) ? selectedDate : activeDates[0];

  return (
    <Select
      value={value}
      onValueChange={onSelect}
      disabled={disabled}
    >
      <SelectTrigger className={`${ds.btnRound} w-full max-w-xs`} style={tajawal}>
        <SelectValue placeholder="اختر يوم التسميع" />
      </SelectTrigger>
      <SelectContent dir="rtl">
        {activeDates.map((iso, idx) => (
          <SelectItem key={iso} value={iso} style={tajawal}>
            {formatActiveDayLabel(idx + 1, iso)}
            {gradedDates?.includes(iso) ? " — تم الرصد" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
