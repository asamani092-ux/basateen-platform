import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  cumulativeBatchSlice,
  leaderAchievementPct,
  sortLeadersByAchievement,
} from "../../lib/competition-table-pagination";
import { ds, tajawal } from "../../lib/design-system";
import type { CompetitionLeaderRow } from "./competition-leaderboard-types";

type LeaderboardMode = "top" | "all";

type Props = {
  isRecitation: boolean;
  leaderboardMode: LeaderboardMode;
  onLeaderboardModeChange: (mode: LeaderboardMode) => void;
  leaderSearch: string;
  onLeaderSearchChange: (value: string) => void;
  leaders: CompetitionLeaderRow[];
};

/** جدول طلاب واحد مرتّب — عرض O(batchSize) صفوف DOM */
export function CompetitionLeaderboardPanel({
  isRecitation,
  leaderboardMode: _leaderboardMode,
  onLeaderboardModeChange: _onLeaderboardModeChange,
  leaderSearch,
  onLeaderSearchChange: _onLeaderSearchChange,
  leaders,
}: Props) {
  const [visibleBatches, setVisibleBatches] = useState(1);

  const rankedLeaders = useMemo(
    () => sortLeadersByAchievement(leaders, isRecitation),
    [leaders, isRecitation],
  );

  const filteredLeaders = useMemo(() => {
    const q = leaderSearch.trim();
    if (!q) return rankedLeaders;
    return rankedLeaders.filter((l) => {
      const name = l.full_name_ar ?? `طالب #${l.student_id}`;
      return name.includes(q);
    });
  }, [rankedLeaders, leaderSearch]);

  useEffect(() => {
    setVisibleBatches(1);
  }, [filteredLeaders.length, isRecitation]);

  const batchSlice = useMemo(
    () => cumulativeBatchSlice(filteredLeaders, visibleBatches),
    [filteredLeaders, visibleBatches],
  );

  const title = isRecitation ? "مؤشرات السرد — جدول الطلاب" : "جدول ترتيب الطلاب";

  return (
    <Card className={`${ds.card} competition-leaderboard-card competition-leaderboard-screen`}>
      <CardHeader>
        <CardTitle style={tajawal}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto text-sm" style={tajawal}>
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-right p-2 w-12">#</th>
              <th className="text-right p-2">الطالب</th>
              {isRecitation ? (
                <>
                  <th className="text-right p-2">المقروء</th>
                  <th className="text-right p-2">المجتاز</th>
                  <th className="text-right p-2">غير المجتاز</th>
                  <th className="text-right p-2">مجموع الأخطاء</th>
                  <th className="text-right p-2">مجموع التنبيهات</th>
                </>
              ) : null}
              <th className="text-right p-2">نسبة الإتقان</th>
            </tr>
          </thead>
          <tbody>
            {batchSlice.items.length === 0 ? (
              <tr>
                <td
                  colSpan={isRecitation ? 8 : 3}
                  className="p-4 text-muted-foreground"
                >
                  {isRecitation ? "لا بيانات سرد بعد." : "لا بيانات إنجاز بعد."}
                </td>
              </tr>
            ) : (
              batchSlice.items.map((l, i) => {
                const rank = i + 1;
                const name = l.full_name_ar ?? `طالب #${l.student_id}`;
                const overallPct = leaderAchievementPct(l, isRecitation);
                return (
                  <tr key={l.student_id} className="border-t">
                    <td className="p-2 tabular-nums">{rank}</td>
                    <td className="p-2">{name}</td>
                    {isRecitation ? (
                      <>
                        <td className="p-2 tabular-nums">{l.read_count ?? 0}</td>
                        <td className="p-2 tabular-nums text-success-foreground">
                          {l.passed_count ?? 0}
                        </td>
                        <td className="p-2 tabular-nums text-destructive">
                          {l.failed_count ?? 0}
                        </td>
                        <td className="p-2 tabular-nums">{l.total_mistakes ?? 0}</td>
                        <td className="p-2 tabular-nums">{l.total_warnings ?? 0}</td>
                      </>
                    ) : null}
                    <td className="p-2 tabular-nums">{overallPct}%</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {batchSlice.has_more ? (
          <div className="pt-3 print:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={ds.btnRound}
              onClick={() => setVisibleBatches((b) => b + 1)}
              style={tajawal}
            >
              عرض المزيد ({batchSlice.items.length} من {batchSlice.total})
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
