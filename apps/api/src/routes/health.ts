import type { Env } from "../env";
import { isProductionEnv } from "../lib/setup-guard";
import { pendingMigrationNames } from "../lib/migrations-status";

async function databaseStatus(env: Env): Promise<{
  ok: boolean;
  users_count: number;
  seeded: boolean;
  hint?: string;
}> {
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM users",
    ).first<{ c: number }>();
    const users_count = Number(row?.c ?? 0);
    return {
      ok: true,
      users_count,
      seeded: users_count > 0,
      ...(!users_count
        ? {
            hint: "شغّل POST /api/setup/seed-users?key=SETUP_KEY على Worker",
          }
        : {}),
    };
  } catch {
    return {
      ok: false,
      users_count: 0,
      seeded: false,
      hint: "نفّذ ترحيل D1 (npm run db:remote:all أو db:remote:upgrade)",
    };
  }
}

export async function handleHealth(
  _request: Request,
  env: Env,
): Promise<Response> {
  const production = isProductionEnv(env);
  const db = await databaseStatus(env);
  const pending = await pendingMigrationNames(env);
  const migrations_ok = pending.length === 0;
  return Response.json({
    ok: migrations_ok && db.ok,
    service: "basateen-api",
    environment: env.ENVIRONMENT ?? "development",
    jwt_configured: Boolean(env.JWT_SECRET?.length),
    setup_key_configured: Boolean(env.SETUP_KEY?.length),
    tv_token_configured: Boolean(env.TV_ACCESS_TOKEN?.length),
    migrations: {
      ok: migrations_ok,
      pending_count: pending.length,
      pending: pending.slice(0, 20),
    },
    db,
    ...(production && !env.JWT_SECRET
      ? { warning: "JWT_SECRET missing — set wrangler secret before go-live" }
      : {}),
  });
}
