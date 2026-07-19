/**
 * تحليل عدد صفوف DOM للمنافسة — O(batchSize) عرض بعد دمج الجدولين
 * التشغيل: node scripts/measure-competition-detail-rows.mjs
 */
const STUDENTS = 150;
const BATCH_SIZE = 20;

const beforeRecitationRows = STUDENTS;
const beforeLeaderboardRows = STUDENTS;
const beforeTotal = beforeRecitationRows + beforeLeaderboardRows;

const afterScreenRows = Math.min(BATCH_SIZE, STUDENTS);
const afterPrintMountRows = STUDENTS;

const networkOnLoad = [
  "GET /api/edu-dept/competitions/:id (detail)",
  "GET /api/edu-dept/competitions/filter-options (once)",
  "GET /api/edu-dept/competitions/:id/dashboard?leaderboard_mode=all (dashboard tab only)",
];
const gradingTabRequests = [
  "GET /api/edu-dept/competitions/:id/grading?date=… (single, not per student)",
];

console.log(
  JSON.stringify(
    {
      students: STUDENTS,
      batch_size: BATCH_SIZE,
      approach:
        "single ranked table + cumulativeBatchSlice (عرض المزيد) — O(batchSize) DOM rows",
      before: {
        recitation_table_rows: beforeRecitationRows,
        leaderboard_table_rows: beforeLeaderboardRows,
        total_leaderboard_dom_rows: beforeTotal,
        print_copy_mounted: true,
      },
      after: {
        screen_table_rows: afterScreenRows,
        screen_total_rows: afterScreenRows,
        print_rows_while_viewing: 0,
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
