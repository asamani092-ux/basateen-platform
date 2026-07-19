import { tajawal } from "../../lib/design-system";
import type { CompetitionLeaderRow } from "./competition-leaderboard-types";

type Props = {
  competitionName: string;
  dateFrom: string;
  dateTo: string;
  scopeLabel: string | null;
  isRecitation: boolean;
  leaders: CompetitionLeaderRow[];
};

/** جدول الطباعة الكامل — يُبنى عند الطباعة فقط (لا صفوف على الشاشة) */
export function CompetitionLeaderboardPrint({
  competitionName,
  dateFrom,
  dateTo,
  scopeLabel,
  isRecitation,
  leaders,
}: Props) {
  return (
    <div className="competition-leaderboard-print-root hidden print:block">
      <div className="competition-print-header mb-4">
        <h2 className="text-xl font-bold" style={tajawal}>
          تقرير مؤشرات المنافسة — {competitionName}
        </h2>
        <p className="text-sm text-muted-foreground" style={tajawal}>
          {dateFrom} → {dateTo}
        </p>
        {scopeLabel ? (
          <p className="text-sm font-medium" style={tajawal}>
            {scopeLabel}
          </p>
        ) : null}
      </div>
      <table className="w-full text-sm edu-print-table competition-leaderboard-table">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-right p-2 w-12">#</th>
            <th className="text-right p-2">الطالب</th>
            <th className="text-right p-2">نسبة الإتقان</th>
          </tr>
        </thead>
        <tbody>
          {leaders.length === 0 ? (
            <tr>
              <td colSpan={3} className="p-4 text-muted-foreground">
                لا بيانات إنجاز بعد.
              </td>
            </tr>
          ) : (
            leaders.map((l, i) => {
              const rank = i + 1;
              const name = l.full_name_ar ?? `طالب #${l.student_id}`;
              const overallPct = isRecitation
                ? (l.mastery_pct ?? 0)
                : (l.overall_pct ?? l.achievement_pct ?? 0);
              return (
                <tr key={l.student_id} className="border-t">
                  <td className="p-2 tabular-nums">{rank}</td>
                  <td className="p-2">{name}</td>
                  <td className="p-2 tabular-nums">{overallPct}%</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
