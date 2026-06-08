import type { Env } from "../types";
import {
  activePlacementSql,
  canJoinStudentHistoryForPlacement,
  hasTable,
  historyCircleColumn,
  historyTrackColumn,
  tableHasColumn,
} from "./db-schema";

export type StudentPlacementSql = {
  historyJoin: string;
  circleJoin: string;
  trackJoin: string;
  circleRef: string;
  trackRef: string;
  historyCircleRef: string | null;
};

/** Builds circle/track joins without referencing missing history columns (v25-safe). */
export async function buildStudentPlacementSql(env: Env): Promise<StudentPlacementSql> {
  const hasCircles = await hasTable(env, "circles");
  const hasTracks = await hasTable(env, "tracks");
  const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
  const hasCurrentTrack = await tableHasColumn(env, "students", "current_track_id");
  const useHistoryJoin = await canJoinStudentHistoryForPlacement(env);
  const historyCircle = useHistoryJoin ? await historyCircleColumn(env, "h") : null;
  const historyTrack = useHistoryJoin ? await historyTrackColumn(env, "h") : null;

  const activePlacement = useHistoryJoin ? await activePlacementSql(env, "h") : "1=0";
  const historyJoin = useHistoryJoin
    ? `LEFT JOIN student_circle_history h
           ON h.student_id = s.id AND ${activePlacement}`
    : "";

  let circleRef = "NULL";
  if (hasCurrentCircle) {
    circleRef = historyCircle
      ? `COALESCE(s.current_circle_id, ${historyCircle})`
      : "s.current_circle_id";
  } else if (historyCircle) {
    circleRef = historyCircle;
  }

  let trackRef = "NULL";
  if (hasCurrentTrack) {
    trackRef = historyTrack
      ? `COALESCE(s.current_track_id, ${historyTrack})`
      : "s.current_track_id";
  } else if (historyTrack) {
    trackRef = historyTrack;
  }

  const circleJoin = hasCircles
    ? `LEFT JOIN circles c ON c.id = ${circleRef}`
    : `LEFT JOIN (SELECT NULL AS id, NULL AS name_ar, NULL AS track_id) c ON 1 = 0`;
  const trackJoin = hasTracks
    ? `LEFT JOIN tracks t ON t.id = ${trackRef}`
    : `LEFT JOIN (SELECT NULL AS id, NULL AS name_ar) t ON 1 = 0`;

  return {
    historyJoin,
    circleJoin,
    trackJoin,
    circleRef,
    trackRef,
    historyCircleRef: historyCircle,
  };
}
