import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type Status = "present" | "absent" | "excused";

const OPTIONS: Array<{
  value: Status;
  label: string;
  activeClass: string;
  idleClass: string;
}> = [
  {
    value: "present",
    label: "حاضر",
    activeClass: ds.attendance.presentActive,
    idleClass: ds.attendance.presentIdle,
  },
  {
    value: "absent",
    label: "غائب",
    activeClass: ds.attendance.absentActive,
    idleClass: ds.attendance.absentIdle,
  },
  {
    value: "excused",
    label: "مستأذن",
    activeClass: ds.attendance.excusedActive,
    idleClass: ds.attendance.excusedIdle,
  },
];

type Props = {
  value: string;
  onChange: (status: Status) => void;
  disabled?: boolean;
  /** عند false لا يُظهر زر «حاضر» نشطاً قبل الاعتماد */
  highlightSaved?: boolean;
};

export function AttendanceStatusButtons({
  value,
  onChange,
  disabled,
  highlightSaved = true,
}: Props) {
  return (
    <div className={cn(ds.attendance.segmentedWrap, "shrink-0")} style={tajawal}>
      {OPTIONS.map((opt) => {
        const isActive = highlightSaved && value === opt.value;
        return (
          <Button
            key={opt.value}
            type="button"
            variant="ghost"
            disabled={disabled}
            className={cn(
              ds.attendance.segmentBase,
              "h-auto shadow-none hover:bg-transparent",
              isActive ? opt.activeClass : opt.idleClass,
            )}
            style={tajawal}
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
