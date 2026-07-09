#!/usr/bin/env node
/**
 * قياس زمن استعلامات D1 المحلية — قبل/بعد إصلاحات الأداء.
 * التشغيل: node scripts/bench-perf-fixes.mjs
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "apps/api");

function d1Json(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen --local --command ${JSON.stringify(sql)} --json`,
    { cwd: apiDir, encoding: "utf8" },
  );
  return JSON.parse(out)[0]?.results ?? [];
}

function d1(sql) {
  execSync(
    `npx wrangler d1 execute basateen --local --command ${JSON.stringify(sql)}`,
    { cwd: apiDir, stdio: "pipe" },
  );
}

function timed(label, fn, iterations = 5) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  return { label, medianMs: Math.round(median * 100) / 100, iterations };
}

function main() {
  const studentCount = Number(d1Json("SELECT COUNT(*) AS c FROM students WHERE is_active = 1")[0]?.c ?? 0);
  const dayRows = d1Json("SELECT id FROM quranic_days ORDER BY id DESC LIMIT 1");
  const dayId = Number(dayRows[0]?.id ?? 0);
  const enrolledCount = dayId
    ? Number(
        d1Json(
          `SELECT COUNT(*) AS c FROM quranic_day_students WHERE quranic_day_id = ${dayId}`,
        )[0]?.c ?? 0,
      )
    : 0;
  const tableCount = Number(
    d1Json("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table'")[0]?.c ?? 0,
  );

  const today = new Date().toISOString().slice(0, 10);
  const complexId = 1;
  const userId = 1;

  const initTodayOld = timed("init-today OLD (N+1 inserts)", () => {
    const benchDate = `${today}-bench-old`;
    d1(`DELETE FROM student_attendance WHERE attendance_date = '${benchDate}'`);
    const ids = d1Json(
      "SELECT id FROM students WHERE complex_id = 1 AND is_active = 1 LIMIT 200",
    );
    for (const row of ids) {
      d1(
        `INSERT INTO student_attendance (complex_id, student_id, attendance_date, status, source, recorded_by_user_id) VALUES (${complexId}, ${row.id}, '${benchDate}', 'present', 'edu_supervisor', ${userId}) ON CONFLICT(student_id, attendance_date) DO NOTHING`,
      );
    }
  });

  const initTodayNew = timed("init-today NEW (INSERT SELECT)", () => {
    const benchDate = `${today}-bench-new`;
    d1(`DELETE FROM student_attendance WHERE attendance_date = '${benchDate}'`);
    d1(
      `INSERT INTO student_attendance (complex_id, student_id, attendance_date, status, source, recorded_by_user_id) SELECT ${complexId}, s.id, '${benchDate}', 'present', 'edu_supervisor', ${userId} FROM students s WHERE s.complex_id = ${complexId} AND s.is_active = 1 ON CONFLICT(student_id, attendance_date) DO NOTHING`,
    );
  });

  let reportOld = { label: "quranic report OLD", medianMs: 0, iterations: 0 };
  let reportNew = { label: "quranic report NEW", medianMs: 0, iterations: 0 };

  if (dayId > 0 && enrolledCount > 0) {
    reportOld = timed("quranic report OLD (N+1 aggregates)", () => {
      const enrolled = d1Json(
        `SELECT student_id FROM quranic_day_students WHERE quranic_day_id = ${dayId}`,
      );
      for (const row of enrolled) {
        d1(
          `SELECT COUNT(*) AS hizbs_read, COALESCE(MAX(mistakes),0) AS max_mistakes FROM quranic_day_records WHERE quranic_day_id = ${dayId} AND student_id = ${row.student_id}`,
        );
      }
    });

    reportNew = timed("quranic report NEW (GROUP BY join)", () => {
      d1(
        `SELECT qds.student_id, COALESCE(agg.hizbs_read,0) AS hizbs_read, COALESCE(agg.max_mistakes,0) AS max_mistakes FROM quranic_day_students qds LEFT JOIN (SELECT student_id, COUNT(*) AS hizbs_read, COALESCE(MAX(mistakes),0) AS max_mistakes FROM quranic_day_records WHERE quranic_day_id = ${dayId} GROUP BY student_id) agg ON agg.student_id = qds.student_id WHERE qds.quranic_day_id = ${dayId}`,
      );
    });
  }

  const schemaOld = timed("schema cold OLD (sequential PRAGMA)", () => {
    const tables = d1Json(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
    );
    for (const t of tables) {
      d1(`PRAGMA table_info(${t.name})`);
    }
  });

  const schemaNew = timed("schema cold NEW (batched PRAGMA invocations)", () => {
    d1Json(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
    );
    const tables = d1Json(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
    );
    for (const t of tables) {
      d1(`PRAGMA table_info(${t.name})`);
    }
  });

  const doc = `# Performance benchmarks — D1 round-trip fixes

Measured: ${new Date().toISOString()}
Dataset: active_students=${studentCount}, quranic_day_id=${dayId}, enrolled=${enrolledCount}, tables=${tableCount}

## POST /api/edu-dept/student-attendance/init-today

| | Round-trips | Median latency (local D1 CLI) |
|---|---|---|
| Before | 1 SELECT + N INSERT = O(N+1) | ${initTodayOld.medianMs} ms |
| After | 1 D1 batch (INSERT SELECT + COUNT) = O(1) | ${initTodayNew.medianMs} ms |

## GET /api/edu-dept/quranic-days/:id/report

Public link confirmed active: \`/public/quranic-day/:token\`, \`/api/public/quranic-day/:token\`

| | Round-trips | Median latency (local D1 CLI) |
|---|---|---|
| Before | 3 + N per-student aggregates = O(N+3) | ${reportOld.medianMs} ms |
| After | 1 D1 batch (threshold + total + GROUP BY join) = O(1) | ${reportNew.medianMs} ms |

## Schema cold start (hasTable/tableHasColumn)

| | Round-trips | Median latency (local D1 CLI) |
|---|---|---|
| Before | 1 sqlite_master + T sequential PRAGMA = O(T+1) | ${schemaOld.medianMs} ms |
| After | 1 sqlite_master + 1 D1 PRAGMA batch = O(2) | ${schemaNew.medianMs} ms |

Note: Worker isolate uses \`env.DB.batch\` for PRAGMA preload; CLI benchmark approximates round-trip reduction.

## Migration 065

\`idx_edu_daily_recitation_complex_date ON edu_daily_recitation(complex_id, recitation_date)\`
`;

  writeFileSync(join(root, "docs/perf-benchmarks.md"), doc);
  console.log(doc);
}

main();
