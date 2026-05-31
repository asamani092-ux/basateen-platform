import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";

export type HimmaDefaults = {
  hizb_points: number;
  alert_penalty: number;
  error_penalty: number;
  alerts_per_error: number;
  fail_threshold_errors: number;
};

export type CompetitionDefaults = {
  mistake_penalty: number;
  alert_penalty: number;
  lahn_penalty: number;
  default_task_weight: number;
};

export const DEFAULT_HIMMA: HimmaDefaults = {
  hizb_points: 1,
  alert_penalty: 1,
  error_penalty: 2,
  alerts_per_error: 5,
  fail_threshold_errors: 3,
};

export const DEFAULT_COMPETITION: CompetitionDefaults = {
  mistake_penalty: 1,
  alert_penalty: 0.5,
  lahn_penalty: 0.5,
  default_task_weight: 1,
};

export function parseHimmaDefaults(raw: string | null | undefined): HimmaDefaults {
  try {
    const o = JSON.parse(raw ?? "{}") as Record<string, number>;
    return {
      hizb_points: Number(o.hizb_points ?? DEFAULT_HIMMA.hizb_points),
      alert_penalty: Number(o.alert_penalty ?? DEFAULT_HIMMA.alert_penalty),
      error_penalty: Number(o.error_penalty ?? DEFAULT_HIMMA.error_penalty),
      alerts_per_error: Number(o.alerts_per_error ?? DEFAULT_HIMMA.alerts_per_error),
      fail_threshold_errors: Number(
        o.fail_threshold_errors ?? DEFAULT_HIMMA.fail_threshold_errors,
      ),
    };
  } catch {
    return { ...DEFAULT_HIMMA };
  }
}

export function parseCompetitionDefaults(
  raw: string | null | undefined,
): CompetitionDefaults {
  try {
    const o = JSON.parse(raw ?? "{}") as Record<string, number>;
    return {
      mistake_penalty: Number(o.mistake_penalty ?? DEFAULT_COMPETITION.mistake_penalty),
      alert_penalty: Number(o.alert_penalty ?? DEFAULT_COMPETITION.alert_penalty),
      lahn_penalty: Number(o.lahn_penalty ?? DEFAULT_COMPETITION.lahn_penalty),
      default_task_weight: Number(
        o.default_task_weight ?? DEFAULT_COMPETITION.default_task_weight,
      ),
    };
  } catch {
    return { ...DEFAULT_COMPETITION };
  }
}

export async function loadEventDefaults(env: Env, complexId: number): Promise<{
  himma: HimmaDefaults;
  competition: CompetitionDefaults;
}> {
  if (!(await hasTable(env, "edu_settings"))) {
    return { himma: { ...DEFAULT_HIMMA }, competition: { ...DEFAULT_COMPETITION } };
  }
  const hasHimma = await tableHasColumn(env, "edu_settings", "himma_defaults_json");
  const hasComp = await tableHasColumn(env, "edu_settings", "competition_defaults_json");
  if (!hasHimma && !hasComp) {
    return { himma: { ...DEFAULT_HIMMA }, competition: { ...DEFAULT_COMPETITION } };
  }
  const cols = [
    hasHimma ? "himma_defaults_json" : null,
    hasComp ? "competition_defaults_json" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const row = await env.DB.prepare(`SELECT ${cols} FROM edu_settings WHERE complex_id = ?`)
    .bind(complexId)
    .first<{ himma_defaults_json?: string | null; competition_defaults_json?: string | null }>();
  return {
    himma: hasHimma
      ? parseHimmaDefaults(row?.himma_defaults_json)
      : { ...DEFAULT_HIMMA },
    competition: hasComp
      ? parseCompetitionDefaults(row?.competition_defaults_json)
      : { ...DEFAULT_COMPETITION },
  };
}

export async function upsertEventDefaults(
  env: Env,
  complexId: number,
  himma?: Partial<HimmaDefaults>,
  competition?: Partial<CompetitionDefaults>,
): Promise<void> {
  const hasHimma = await tableHasColumn(env, "edu_settings", "himma_defaults_json");
  const hasComp = await tableHasColumn(env, "edu_settings", "competition_defaults_json");
  if (!hasHimma && !hasComp) return;

  const current = await loadEventDefaults(env, complexId);
  const nextHimma = { ...current.himma, ...himma };
  const nextComp = { ...current.competition, ...competition };

  const hasRabt = await tableHasColumn(env, "edu_settings", "rabt_weight");
  if (hasHimma && hasComp) {
    await env.DB.prepare(
      `INSERT INTO edu_settings (
         complex_id, weight_listening, weight_revision, weight_repeat,
         ${hasRabt ? "rabt_weight," : ""} penalty_per_error,
         himma_defaults_json, competition_defaults_json, updated_at
       ) VALUES (?, 1, 1, 1, ${hasRabt ? "1," : ""} 0.5, ?, ?, datetime('now'))
       ON CONFLICT(complex_id) DO UPDATE SET
         himma_defaults_json = excluded.himma_defaults_json,
         competition_defaults_json = excluded.competition_defaults_json,
         updated_at = datetime('now')`,
    )
      .bind(
        complexId,
        JSON.stringify(nextHimma),
        JSON.stringify(nextComp),
      )
      .run();
    return;
  }
  if (hasHimma) {
    await env.DB.prepare(
      `INSERT INTO edu_settings (complex_id, weight_listening, weight_revision, weight_repeat, penalty_per_error, himma_defaults_json, updated_at)
       VALUES (?, 1, 1, 1, 0.5, ?, datetime('now'))
       ON CONFLICT(complex_id) DO UPDATE SET
         himma_defaults_json = excluded.himma_defaults_json,
         updated_at = datetime('now')`,
    )
      .bind(complexId, JSON.stringify(nextHimma))
      .run();
  }
  if (hasComp) {
    await env.DB.prepare(
      `INSERT INTO edu_settings (complex_id, weight_listening, weight_revision, weight_repeat, penalty_per_error, competition_defaults_json, updated_at)
       VALUES (?, 1, 1, 1, 0.5, ?, datetime('now'))
       ON CONFLICT(complex_id) DO UPDATE SET
         competition_defaults_json = excluded.competition_defaults_json,
         updated_at = datetime('now')`,
    )
      .bind(complexId, JSON.stringify(nextComp))
      .run();
  }
}
