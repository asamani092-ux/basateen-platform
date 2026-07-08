# Performance benchmarks — D1 round-trip fixes

Measured: 2026-07-08 (local D1, N=8 active students, enrolled=8)

Method: wrangler d1 CLI wall-clock (production Worker uses `env.DB.batch` — same round-trip count, lower RTT overhead)

## POST /api/edu-dept/student-attendance/init-today

| | Round-trips | Latency (local, N=8) |
|---|---|---|
| Before | 1 SELECT + N INSERT = **O(N+1)** | **10.2 s** |
| After | 1 D1 batch (INSERT SELECT + COUNT) = **O(1)** | **1.6 s** |

## GET /api/edu-dept/quranic-days/:id/report

Public link active: `/public/quranic-day/:token`, `/api/public/quranic-day/:token`

| | Round-trips | Latency (local, N=8) |
|---|---|---|
| Before | 3 + N per-student aggregates = **O(N+3)** | **10.7 s** |
| After | 1 D1 batch (threshold + total + GROUP BY join) = **O(1)** | **1.6 s** |

## Schema cold start (hasTable/tableHasColumn)

| | Round-trips | Notes |
|---|---|---|
| Before | 1 sqlite_master + T sequential PRAGMA = **O(T+1)** | ~1.3 s per PRAGMA via CLI |
| After | 1 sqlite_master + 1 D1 PRAGMA batch = **O(2)** | Preload on first `hasTable`; TTL 600s |

## Migration 065

`idx_edu_daily_recitation_complex_date ON edu_daily_recitation(complex_id, recitation_date)`
