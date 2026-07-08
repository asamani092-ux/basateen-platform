# Performance benchmarks — D1 round-trip fixes

Measured: 2026-07-08T19:28:12.760Z
Dataset: active_students=8, quranic_day_id=1, enrolled=8, tables=53

## POST /api/edu-dept/student-attendance/init-today

| | Round-trips | Median latency (local D1 CLI) |
|---|---|---|
| Before | 1 SELECT + N INSERT = O(N+1) | 12764.55 ms |
| After | 1 D1 batch (INSERT SELECT + COUNT) = O(1) | 2468.48 ms |

## GET /api/edu-dept/quranic-days/:id/report

Public link confirmed active: `/public/quranic-day/:token`, `/api/public/quranic-day/:token`

| | Round-trips | Median latency (local D1 CLI) |
|---|---|---|
| Before | 3 + N per-student aggregates = O(N+3) | 10996.37 ms |
| After | 1 D1 batch (threshold + total + GROUP BY join) = O(1) | 1206.46 ms |

## Schema cold start (hasTable/tableHasColumn)

| | Round-trips | Median latency (local D1 CLI) |
|---|---|---|
| Before | 1 sqlite_master + T sequential PRAGMA = O(T+1) | 65291.86 ms |
| After | 1 sqlite_master + 1 D1 PRAGMA batch = O(2) | 66793.08 ms |

Note: Worker isolate uses `env.DB.batch` for PRAGMA preload; CLI benchmark approximates round-trip reduction.

## Migration 065

`idx_edu_daily_recitation_complex_date ON edu_daily_recitation(complex_id, recitation_date)`
