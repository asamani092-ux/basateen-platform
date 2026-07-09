/**
 * تحليل عدد صفوف DOM للمنافسة — O(1) عرض بعد الترقيم
 * التشغيل: node scripts/measure-competition-detail-rows.mjs
 */
const STUDENTS = 150;
const PAGE_SIZE = 25;

const beforeRecitationRows = STUDENTS;
const beforeLeaderboardRows = STUDENTS;
const beforeTotal = beforeRecitationRows + beforeLeaderboardRows;

const afterRecitationRows = Math.min(PAGE_SIZE, STUDENTS);
const afterLeaderboardRows = Math.min(PAGE_SIZE, STUDENTS);
const afterScreenTotal = afterRecitationRows + afterLeaderboardRows;
const afterNormalPrintRows = 0;
const afterPrintMountRows = STUDENTS;

const networkOnLoad = [
  "GET /api/edu-dept/competitions/:id (detail)",
  "GET /api/edu-dept/competitions/filter-options (once)",
  "GET /api/edu-dept/competitions/:id/dashboard (dashboard tab only)",
];
const gradingTabRequests = [
  "GET /api/edu-dept/competitions/:id/grading?date=… (single, not per student)",
];

console.log(
  JSON.stringify(
    {
      students: STUDENTS,
      page_size: PAGE_SIZE,
      approach: "pagination (TablePagination) — bounded O(pageSize) DOM rows",
      before: {
        recitation_table_rows: beforeRecitationRows,
        leaderboard_table_rows: beforeLeaderboardRows,
        total_leaderboard_dom_rows: beforeTotal,
        print_copy_mounted: true,
      },
      after: {
        screen_recitation_rows: afterRecitationRows,
        screen_leaderboard_rows: afterLeaderboardRows,
        screen_total_rows: afterScreenTotal,
        print_rows_while_viewing: afterNormalPrintRows,
        print_rows_during_print_action: afterPrintMountRows,
      },
      network: {
        on_initial_page_load: networkOnLoad.length,
        on_initial_page_load_endpoints: networkOnLoad,
        grading_tab: gradingTabRequests.length,
        grading_tab_endpoints: gradingTabRequests,
        scales_with_student_count: false,
      },
    },
    null,
    2,
  ),
);
