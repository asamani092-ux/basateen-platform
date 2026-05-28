import type { Env } from "./types";
import { handleOptions, withCors } from "./middleware/cors";
import { handleHealth } from "./routes/health";
import { handleTvSummary } from "./routes/tv-summary";
import { handleLogin, handleLoginMobile, handleMe } from "./routes/auth";
import { handleSeedUsers } from "./routes/setup";
import { handleSeedEduExamples } from "./routes/setup-edu-examples";
import { handleStudentsList } from "./routes/students";
import {
  handleStudentsBulkImport,
  handleStudentsExport,
} from "./routes/students-bulk";
import { handleCirclesList } from "./routes/circles";
import {
  handleStudentDetail,
  handleStudentTransfer,
} from "./routes/transfers";
import {
  handleYomHimmaCreate,
  handleYomHimmaDetail,
  handleYomHimmaList,
  handleYomHimmaTv,
  handleYomHimmaUpsertAudit,
} from "./routes/yom-himma";
import {
  handleComplexSettingsGet,
  handleComplexSettingsPatch,
} from "./routes/complex-settings";
import {
  handleTeacherDailyList,
  handleTeacherDailyUpsert,
} from "./routes/teacher-daily";
import { handleTeacherRouter } from "./routes/teacher-plans";
import { handleAdminGmRouter } from "./routes/admin-gm";
import {
  handleAdminStats,
  handleAdminYomHimmaSummary,
  handleAdminStaffAttendanceList,
  handleAdminStaffAttendanceUpsert,
  handleAdminComplexSettingsGet,
  handleAdminComplexSettingsPatch,
} from "./routes/admin-gm-stats";
import { handleGeneralSupervisorRouter } from "./routes/general-supervisor";
import { handleEduSupervisorRouter } from "./routes/edu-supervisor";
import { handleEduCompetitionsRouter } from "./routes/competitions";
import { handleEduPublicReciterRouter } from "./routes/edu-public-reciter";
import { handleEduSupervisorGridRouter } from "./routes/edu-supervisor-grid";
import { handleLiveLogRouter, handleYomHimmaLiveLogToken } from "./routes/live-log";
import { handleProgSupervisorRouter } from "./routes/prog-supervisor";
import { handleQuizPublicRouter } from "./routes/quiz-public";
import { handleSeedProgExamples } from "./routes/setup-prog-examples";

type RouteHandler = (
  request: Request,
  env: Env,
  url: URL,
) => Promise<Response> | Response;

const routes: Array<{ method: string; pattern: RegExp; handler: RouteHandler }> = [
  { method: "GET", pattern: /^\/api\/health$/, handler: handleHealth },
  { method: "GET", pattern: /^\/api\/tv\/summary$/, handler: handleTvSummary },
  { method: "POST", pattern: /^\/api\/auth\/login$/, handler: handleLogin },
  {
    method: "POST",
    pattern: /^\/api\/auth\/login-mobile$/,
    handler: handleLoginMobile,
  },
  { method: "GET", pattern: /^\/api\/auth\/me$/, handler: handleMe },
  { method: "POST", pattern: /^\/api\/setup\/seed-users$/, handler: handleSeedUsers },
  {
    method: "POST",
    pattern: /^\/api\/setup\/seed-edu-examples$/,
    handler: handleSeedEduExamples,
  },
  {
    method: "POST",
    pattern: /^\/api\/setup\/seed-prog-examples$/,
    handler: handleSeedProgExamples,
  },
  { method: "GET", pattern: /^\/api\/circles$/, handler: handleCirclesList },
  { method: "GET", pattern: /^\/api\/students$/, handler: handleStudentsList },
  { method: "GET", pattern: /^\/api\/students\/export$/, handler: handleStudentsExport },
  { method: "POST", pattern: /^\/api\/students\/bulk$/, handler: handleStudentsBulkImport },
  {
    method: "GET",
    pattern: /^\/api\/students\/\d+$/,
    handler: handleStudentDetail,
  },
  {
    method: "POST",
    pattern: /^\/api\/students\/\d+\/transfer$/,
    handler: handleStudentTransfer,
  },
  { method: "GET", pattern: /^\/api\/yom-himma$/, handler: handleYomHimmaList },
  { method: "POST", pattern: /^\/api\/yom-himma$/, handler: handleYomHimmaCreate },
  {
    method: "GET",
    pattern: /^\/api\/yom-himma\/tv$/,
    handler: handleYomHimmaTv,
  },
  {
    method: "GET",
    pattern: /^\/api\/yom-himma\/\d+$/,
    handler: handleYomHimmaDetail,
  },
  {
    method: "POST",
    pattern: /^\/api\/yom-himma\/\d+\/audit$/,
    handler: handleYomHimmaUpsertAudit,
  },
  {
    method: "GET",
    pattern: /^\/api\/complex\/settings$/,
    handler: handleComplexSettingsGet,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/complex\/settings$/,
    handler: handleComplexSettingsPatch,
  },
  {
    method: "GET",
    pattern: /^\/api\/teacher\/daily-marks$/,
    handler: handleTeacherDailyList,
  },
  {
    method: "POST",
    pattern: /^\/api\/teacher\/daily-marks$/,
    handler: handleTeacherDailyUpsert,
  },
];

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const options = handleOptions(request, env);
  if (options) return options;

  const url = new URL(request.url);

  const adminGm = await handleAdminGmRouter(request, env, url);
  if (adminGm) return withCors(adminGm, request, env);

  const gsRoute = await handleGeneralSupervisorRouter(request, env, url);
  if (gsRoute) return withCors(gsRoute, request, env);

  const liveLog = await handleLiveLogRouter(request, env, url);
  if (liveLog) return withCors(liveLog, request, env);

  const himmaLiveToken = await handleYomHimmaLiveLogToken(request, env, url);
  if (himmaLiveToken) return withCors(himmaLiveToken, request, env);

  const eduComp = await handleEduCompetitionsRouter(request, env, url);
  if (eduComp) return withCors(eduComp, request, env);

  const eduRoute = await handleEduSupervisorRouter(request, env, url);
  if (eduRoute) return withCors(eduRoute, request, env);

  const quizPublic = await handleQuizPublicRouter(request, env, url);
  if (quizPublic) return withCors(quizPublic, request, env);

  const progRoute = await handleProgSupervisorRouter(request, env, url);
  if (progRoute) return withCors(progRoute, request, env);

  const teacherRoute = await handleTeacherRouter(request, env, url);
  if (teacherRoute) return withCors(teacherRoute, request, env);

  const adminStatsRoutes: Array<{
    method: string;
    path: string;
    handler: RouteHandler;
  }> = [
    { method: "GET", path: "/api/admin/stats", handler: handleAdminStats },
    {
      method: "GET",
      path: "/api/admin/yom-himma-summary",
      handler: handleAdminYomHimmaSummary,
    },
    {
      method: "GET",
      path: "/api/admin/staff-attendance",
      handler: handleAdminStaffAttendanceList,
    },
    {
      method: "POST",
      path: "/api/admin/staff-attendance",
      handler: handleAdminStaffAttendanceUpsert,
    },
    {
      method: "GET",
      path: "/api/admin/complex-settings",
      handler: handleAdminComplexSettingsGet,
    },
    {
      method: "PATCH",
      path: "/api/admin/complex-settings",
      handler: handleAdminComplexSettingsPatch,
    },
  ];
  for (const r of adminStatsRoutes) {
    if (request.method === r.method && url.pathname === r.path) {
      return withCors(await r.handler(request, env, url), request, env);
    }
  }

  for (const route of routes) {
    if (request.method === route.method && route.pattern.test(url.pathname)) {
      const response = await route.handler(request, env, url);
      return withCors(response, request, env);
    }
  }

  return withCors(
    Response.json({ error: "Not Found", path: url.pathname }, { status: 404 }),
    request,
    env,
  );
}
