import type { Env } from "./types";
import { handleOptions, withCors } from "./middleware/cors";
import { handleHealth } from "./routes/health";
import { handleTvSummary } from "./routes/tv-summary";
import { handleLogin, handleLoginMobile, handleMe } from "./routes/auth";
import { handleSeedUsers } from "./routes/setup";
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
import { handleAdminDeptRouter } from "./routes/admin-dept";
import { handlePublicLinksRouter } from "./routes/public-links";
import { handleEduDeptRouter } from "./routes/edu-dept";
import { handleEduDeptCoreRouter } from "./routes/edu-dept-core";
import { handleEduDeptMegaRouter } from "./routes/edu-dept-mega";
import {
  handleEduQuranicDaysRouter,
  handlePublicQuranicDayRouter,
} from "./routes/edu-quranic-days";
import { handleEduCompetitionsRouter } from "./routes/competitions";
import { handleLiveLogRouter, handleYomHimmaLiveLogToken } from "./routes/live-log";
import { handleProgSupervisorRouter } from "./routes/prog-supervisor";
import { handleQuizPublicRouter } from "./routes/quiz-public";
import { handleDisplayDeptRouter } from "./routes/display-dept";
import { handlePublicLiveDisplayRouter } from "./routes/public-live-display";

type RouteHandler = (
  request: Request,
  env: Env,
  url: URL,
) => Promise<Response> | Response;

/** Map new department API prefixes to legacy handlers during transition */
function withPathPrefix(url: URL, fromPrefix: string, toPrefix: string): URL {
  if (!url.pathname.startsWith(fromPrefix)) return url;
  const next = new URL(url.toString());
  next.pathname = toPrefix + url.pathname.slice(fromPrefix.length);
  return next;
}

const sharedRoutes: Array<{ method: string; pattern: RegExp; handler: RouteHandler }> = [
  { method: "GET", pattern: /^\/api\/health$/, handler: handleHealth },
  { method: "GET", pattern: /^\/api\/tv\/summary$/, handler: handleTvSummary },
  { method: "POST", pattern: /^\/api\/auth\/login$/, handler: handleLogin },
  { method: "POST", pattern: /^\/api\/auth\/login-mobile$/, handler: handleLoginMobile },
  { method: "GET", pattern: /^\/api\/auth\/me$/, handler: handleMe },
  { method: "POST", pattern: /^\/api\/setup\/seed-users$/, handler: handleSeedUsers },
  { method: "GET", pattern: /^\/api\/circles$/, handler: handleCirclesList },
  { method: "GET", pattern: /^\/api\/students$/, handler: handleStudentsList },
  { method: "GET", pattern: /^\/api\/students\/export$/, handler: handleStudentsExport },
  { method: "POST", pattern: /^\/api\/students\/bulk$/, handler: handleStudentsBulkImport },
  { method: "GET", pattern: /^\/api\/students\/\d+$/, handler: handleStudentDetail },
  { method: "POST", pattern: /^\/api\/students\/\d+\/transfer$/, handler: handleStudentTransfer },
  { method: "GET", pattern: /^\/api\/yom-himma$/, handler: handleYomHimmaList },
  { method: "POST", pattern: /^\/api\/yom-himma$/, handler: handleYomHimmaCreate },
  { method: "GET", pattern: /^\/api\/yom-himma\/tv$/, handler: handleYomHimmaTv },
  { method: "GET", pattern: /^\/api\/yom-himma\/\d+$/, handler: handleYomHimmaDetail },
  { method: "POST", pattern: /^\/api\/yom-himma\/\d+\/audit$/, handler: handleYomHimmaUpsertAudit },
  { method: "GET", pattern: /^\/api\/complex\/settings$/, handler: handleComplexSettingsGet },
  { method: "PATCH", pattern: /^\/api\/complex\/settings$/, handler: handleComplexSettingsPatch },
  { method: "GET", pattern: /^\/api\/teacher\/daily-marks$/, handler: handleTeacherDailyList },
  { method: "POST", pattern: /^\/api\/teacher\/daily-marks$/, handler: handleTeacherDailyUpsert },
];

const superAdminStats: Array<{ method: string; path: string; handler: RouteHandler }> = [
  { method: "GET", path: "/api/super-admin/stats", handler: handleAdminStats },
  { method: "GET", path: "/api/admin/stats", handler: handleAdminStats },
  {
    method: "GET",
    path: "/api/super-admin/yom-himma-summary",
    handler: handleAdminYomHimmaSummary,
  },
  { method: "GET", path: "/api/admin/yom-himma-summary", handler: handleAdminYomHimmaSummary },
  {
    method: "GET",
    path: "/api/super-admin/staff-attendance",
    handler: handleAdminStaffAttendanceList,
  },
  { method: "GET", path: "/api/admin/staff-attendance", handler: handleAdminStaffAttendanceList },
  {
    method: "POST",
    path: "/api/super-admin/staff-attendance",
    handler: handleAdminStaffAttendanceUpsert,
  },
  { method: "POST", path: "/api/admin/staff-attendance", handler: handleAdminStaffAttendanceUpsert },
  {
    method: "GET",
    path: "/api/super-admin/complex-settings",
    handler: handleAdminComplexSettingsGet,
  },
  { method: "GET", path: "/api/admin/complex-settings", handler: handleAdminComplexSettingsGet },
  {
    method: "PATCH",
    path: "/api/super-admin/complex-settings",
    handler: handleAdminComplexSettingsPatch,
  },
  { method: "PATCH", path: "/api/admin/complex-settings", handler: handleAdminComplexSettingsPatch },
];

async function dispatchDepartmentRouters(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const superUrl = withPathPrefix(url, "/api/super-admin/", "/api/admin/");
  const superAdmin = await handleAdminGmRouter(request, env, superUrl);
  if (superAdmin) return superAdmin;
  const legacyAdmin = await handleAdminGmRouter(request, env, url);
  if (legacyAdmin) return legacyAdmin;

  const adminDept = await handleAdminDeptRouter(request, env, url);
  if (adminDept) return adminDept;

  const legacyGsUrl = withPathPrefix(url, "/api/general-supervisor/", "/api/admin-dept/");
  const legacyGs = await handleAdminDeptRouter(request, env, legacyGsUrl);
  if (legacyGs) return legacyGs;

  const eduUrl = withPathPrefix(url, "/api/edu-supervisor/", "/api/edu-dept/");
  const eduCoreUrl = eduUrl;
  const eduCore = await handleEduDeptCoreRouter(request, env, eduCoreUrl);
  if (eduCore) return eduCore;
  const eduCoreMain = await handleEduDeptCoreRouter(request, env, url);
  if (eduCoreMain) return eduCoreMain;

  const eduMegaUrl = eduUrl;
  const eduMega = await handleEduDeptMegaRouter(request, env, eduMegaUrl);
  if (eduMega) return eduMega;
  const eduMegaMain = await handleEduDeptMegaRouter(request, env, url);
  if (eduMegaMain) return eduMegaMain;

  const eduQuranicUrl = eduUrl;
  const eduQuranic = await handleEduQuranicDaysRouter(request, env, eduQuranicUrl);
  if (eduQuranic) return eduQuranic;
  const eduQuranicMain = await handleEduQuranicDaysRouter(request, env, url);
  if (eduQuranicMain) return eduQuranicMain;

  const edu = await handleEduDeptRouter(request, env, eduUrl);
  if (edu) return edu;
  const eduDept = await handleEduDeptRouter(request, env, url);
  if (eduDept) return eduDept;

  const broadcast = await handleLiveLogRouter(request, env, url);
  if (broadcast) return broadcast;

  const himmaLiveToken = await handleYomHimmaLiveLogToken(request, env, url);
  if (himmaLiveToken) return himmaLiveToken;

  const compUrl = withPathPrefix(url, "/api/edu-supervisor/", "/api/edu-dept/");
  const eduCompLegacy = await handleEduCompetitionsRouter(request, env, compUrl);
  if (eduCompLegacy) return eduCompLegacy;
  const eduComp = await handleEduCompetitionsRouter(request, env, url);
  if (eduComp) return eduComp;

  const progUrl = withPathPrefix(url, "/api/prog-dept/", "/api/prog-supervisor/");
  const prog = await handleProgSupervisorRouter(request, env, progUrl);
  if (prog) return prog;
  const legacyProg = await handleProgSupervisorRouter(request, env, url);
  if (legacyProg) return legacyProg;

  const displayDept = await handleDisplayDeptRouter(request, env, url);
  if (displayDept) return displayDept;

  const teacher = await handleTeacherRouter(request, env, url);
  if (teacher) return teacher;

  return null;
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const options = handleOptions(request, env);
  if (options) return options;

  const url = new URL(request.url);

  try {
    const publicQuranic = await handlePublicQuranicDayRouter(request, env, url);
    if (publicQuranic) return withCors(publicQuranic, request, env);

    const publicLink = await handlePublicLinksRouter(request, env, url);
    if (publicLink) return withCors(publicLink, request, env);

    const publicLive = await handlePublicLiveDisplayRouter(request, env, url);
    if (publicLive) return withCors(publicLive, request, env);

    const quizPublic = await handleQuizPublicRouter(request, env, url);
    if (quizPublic) return withCors(quizPublic, request, env);

    const dept = await dispatchDepartmentRouters(request, env, url);
    if (dept) return withCors(dept, request, env);

    for (const r of superAdminStats) {
      if (request.method === r.method && url.pathname === r.path) {
        return withCors(await r.handler(request, env, url), request, env);
      }
    }

    for (const route of sharedRoutes) {
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
  } catch (error: unknown) {
    console.error("Router exception:", error);
    return withCors(
      Response.json(
        {
          error: "api_internal_crash",
          message:
            error instanceof Error ? error.message : "Uncaught runtime error",
        },
        { status: 500 },
      ),
      request,
      env,
    );
  }
}
