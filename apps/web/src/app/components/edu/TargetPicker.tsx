import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { matchesArabicName } from "../../lib/attendance-search";
import { ds, tajawal } from "../../lib/design-system";

export type TargetSelection = {
  student_ids: number[];
  circle_ids: number[];
  track_ids: number[];
};

type Props = {
  value: TargetSelection;
  onChange: (v: TargetSelection) => void;
};

export function TargetPicker({ value, onChange }: Props) {
  const [students, setStudents] = useState<
    Array<{ id: number; full_name_ar: string; circle_name: string | null }>
  >([]);
  const [circles, setCircles] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [tracks, setTracks] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!canUseApi()) {
      setStudents([
        { id: 1, full_name_ar: "أحمد محمد", circle_name: "حلقة الصديق" },
        { id: 2, full_name_ar: "خالد سعود", circle_name: "حلقة النور" },
        { id: 3, full_name_ar: "فهد عبدالله", circle_name: "حلقة الإتقان" },
      ]);
      setCircles([
        { id: 1, name_ar: "حلقة الصديق" },
        { id: 2, name_ar: "حلقة النور" },
      ]);
      setTracks([{ id: 1, name_ar: "مسار الحفظ" }]);
      return;
    }
    api.eduTargetOptions().then((res) => {
      setStudents(
        (res.students as Array<Record<string, unknown>>).map((s) => ({
          id: Number(s.id),
          full_name_ar: String(s.full_name_ar),
          circle_name: s.circle_name ? String(s.circle_name) : null,
        })),
      );
      setCircles(
        (res.circles as Array<Record<string, unknown>>).map((c) => ({
          id: Number(c.id),
          name_ar: String(c.name_ar),
        })),
      );
      setTracks(
        (res.tracks as Array<Record<string, unknown>>).map((t) => ({
          id: Number(t.id),
          name_ar: String(t.name_ar),
        })),
      );
    });
  }, []);

  function toggleStudent(id: number) {
    const set = new Set(value.student_ids);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...value, student_ids: [...set] });
  }

  function toggleCircle(id: number) {
    const set = new Set(value.circle_ids);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...value, circle_ids: [...set] });
  }

  const filtered = students.filter((s) => matchesArabicName(q, s.full_name_ar));

  return (
    <div className={`${ds.card} p-4 space-y-4`}>
      <p className="font-semibold text-sm" style={tajawal}>
        المستهدفون
      </p>
      <div>
        <p className="text-xs text-muted-foreground mb-2" style={tajawal}>
          حلقات
        </p>
        <div className="flex flex-wrap gap-2">
          {circles.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCircle(c.id)}
              className={`px-3 py-1 rounded-full text-sm border ${
                value.circle_ids.includes(c.id)
                  ? "bg-primary text-primary-foreground"
                  : "border-border"
              }`}
              style={tajawal}
            >
              {c.name_ar}
            </button>
          ))}
        </div>
      </div>
      <div>
        <input
          type="search"
          placeholder="بحث طالب…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm mb-2"
          style={tajawal}
        />
        <div className="max-h-48 overflow-y-auto space-y-1">
          {filtered.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 text-sm cursor-pointer py-1"
              style={tajawal}
            >
              <input
                type="checkbox"
                checked={value.student_ids.includes(s.id)}
                onChange={() => toggleStudent(s.id)}
              />
              {s.full_name_ar}
              <span className="text-muted-foreground text-xs">
                {s.circle_name ?? ""}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
