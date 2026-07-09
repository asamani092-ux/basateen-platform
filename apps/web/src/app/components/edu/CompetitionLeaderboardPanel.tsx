import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { TablePagination } from "../shared/TablePagination";
import { buildCompetitionWhatsAppUrl } from "../../lib/competition-engine";
import { paginateSlice } from "../../lib/competition-table-pagination";
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

/** لوحة الصدارة على الشاشة — ترقيم صفحات O(1) صفوف معروضة لكل جدول */
export function CompetitionLeaderboardPanel({
  isRecitation,
  leaderboardMode,
  onLeaderboardModeChange,
  leaderSearch,
  onLeaderSearchChange,
  leaders,
}: Props) {
  const [recitationPage, setRecitationPage] = useState(1);
  const [leaderboardPage, setLeaderboardPage] = useState(1);

  useEffect(() => {
    setRecitationPage(1);
    setLeaderboardPage(1);
  }, [leaders.length, leaderSearch, leaderboardMode]);

  const recitationSlice = useMemo(
    () => paginateSlice(leaders, recitationPage),
    [leaders, recitationPage],
  );
  const leaderboardSlice = useMemo(
    () => paginateSlice(leaders, leaderboardPage),
    [leaders, leaderboardPage],
  );

  return (
    <>
      {isRecitation ? (
        <Card className={`${ds.card} competition-leaderboard-screen`}>
          <CardHeader>
            <CardTitle style={tajawal}>مؤشرات السرد — جدول الطلاب</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" style={tajawal}>
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-right p-2">الطالب</th>
                  <th className="text-right p-2">المقروء</th>
                  <th className="text-right p-2">المجتاز</th>
                  <th className="text-right p-2">غير المجتاز</th>
                  <th className="text-right p-2">مجموع الأخطاء</th>
                  <th className="text-right p-2">مجموع التنبيهات</th>
                  <th className="text-right p-2">نسبة الإتقان</th>
                </tr>
              </thead>
              <tbody>
                {recitationSlice.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-muted-foreground">
                      لا بيانات سرد بعد.
                    </td>
                  </tr>
                ) : (
                  recitationSlice.items.map((l) => (
                    <tr key={l.student_id} className="border-t">
                      <td className="p-2">
                        {l.full_name_ar ?? `طالب #${l.student_id}`}
                      </td>
                      <td className="p-2 tabular-nums">{l.read_count ?? 0}</td>
                      <td className="p-2 tabular-nums text-success-foreground">
                        {l.passed_count ?? 0}
                      </td>
                      <td className="p-2 tabular-nums text-destructive">
                        {l.failed_count ?? 0}
                      </td>
                      <td className="p-2 tabular-nums">{l.total_mistakes ?? 0}</td>
                      <td className="p-2 tabular-nums">{l.total_warnings ?? 0}</td>
                      <td className="p-2 tabular-nums">{l.mastery_pct ?? 0}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {recitationSlice.total > recitationSlice.page_size && (
              <TablePagination
                page={recitationSlice}
                onPageChange={setRecitationPage}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className={`${ds.card} competition-leaderboard-card competition-leaderboard-screen`}>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle style={tajawal}>
              {leaderboardMode === "all" ? "جميع الطلاب" : "الأوائل"}
            </CardTitle>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button
                type="button"
                variant={leaderboardMode === "top" ? "default" : "outline"}
                size="sm"
                className={ds.btnRound}
                onClick={() => onLeaderboardModeChange("top")}
                style={tajawal}
              >
                عرض الأوائل
              </Button>
              <Button
                type="button"
                variant={leaderboardMode === "all" ? "default" : "outline"}
                size="sm"
                className={ds.btnRound}
                onClick={() => onLeaderboardModeChange("all")}
                style={tajawal}
              >
                عرض كل الطلاب
              </Button>
            </div>
          </div>
          {leaderboardMode === "all" && (
            <div className="relative max-w-sm print:hidden">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="بحث عن طالب…"
                value={leaderSearch}
                onChange={(e) => onLeaderSearchChange(e.target.value)}
                className={`${ds.btnRound} pr-10`}
                style={tajawal}
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto text-sm" style={tajawal}>
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-right p-2 w-12">#</th>
                <th className="text-right p-2">الطالب</th>
                <th className="text-right p-2">نسبة الإتقان</th>
                <th className="text-right p-2 print:hidden w-36">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardSlice.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-muted-foreground">
                    لا بيانات إنجاز بعد.
                  </td>
                </tr>
              ) : (
                leaderboardSlice.items.map((l, i) => {
                  const rank =
                    (leaderboardSlice.page - 1) * leaderboardSlice.page_size + i + 1;
                  const name = l.full_name_ar ?? `طالب #${l.student_id}`;
                  const overallPct = isRecitation
                    ? (l.mastery_pct ?? 0)
                    : (l.overall_pct ?? l.achievement_pct ?? 0);
                  const waUrl = buildCompetitionWhatsAppUrl(
                    l.guardian_phone,
                    name,
                    overallPct,
                    rank,
                  );
                  return (
                    <tr key={l.student_id} className="border-t">
                      <td className="p-2 tabular-nums">{rank}</td>
                      <td className="p-2">{name}</td>
                      <td className="p-2 tabular-nums">{overallPct}%</td>
                      <td className="p-2 print:hidden">
                        {waUrl ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={`${ds.btnRound} gap-1`}
                            asChild
                          >
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="إرسال التقرير لولي الأمر"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              إرسال التقرير
                            </a>
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {leaderboardSlice.total > leaderboardSlice.page_size && (
            <TablePagination page={leaderboardSlice} onPageChange={setLeaderboardPage} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
