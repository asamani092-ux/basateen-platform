import type { Env } from "../env";
import { tvAccessAllowed } from "../lib/setup-guard";

export async function handleTvSummary(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!tvAccessAllowed(request, env)) {
    return Response.json({ error: "tv_access_denied" }, { status: 403 });
  }

  if (!env.DB) {
    return Response.json(
      { error: "D1 binding DB is not configured" },
      { status: 500 },
    );
  }

  const row = await env.DB.prepare(
    `SELECT present_count, absent_count, active_circles, snapshot_date
     FROM daily_attendance_snapshot
     WHERE complex_id = 1
     ORDER BY id DESC
     LIMIT 1`,
  ).first<{
    present_count: number;
    absent_count: number;
    active_circles: number;
    snapshot_date: string;
  }>();

  const present = Number(row?.present_count ?? 0);
  const absent = Number(row?.absent_count ?? 0);
  const total = present + absent;
  const attendance_rate =
    total > 0 ? Math.round((present / total) * 1000) / 10 : 0;

  return Response.json({
    complex: "مجمع حلقات بساتين",
    date: row?.snapshot_date ?? null,
    present,
    absent,
    attendance_rate,
    active_circles: Number(row?.active_circles ?? 0),
    updated_at: new Date().toISOString(),
  });
}
