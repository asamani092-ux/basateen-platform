import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "apps/web/src/app/components/admin/StudentUnifiedSingleForm.tsx",
  "apps/web/src/app/pages/admin/CirclesSetupPage.tsx",
  "apps/web/src/app/pages/admin/StaffManagementPage.tsx",
  "apps/web/src/app/pages/admin-dept/PledgesPage.tsx",
  "apps/web/src/app/pages/auth/LoginPage.tsx",
  "apps/web/src/app/pages/display-dept/DisplayManagerPage.tsx",
  "apps/web/src/app/pages/edu-dept/DailyRecitationPage.tsx",
  "apps/web/src/app/pages/edu-dept/EduTransfersPage.tsx",
  "apps/web/src/app/pages/edu-dept/TeacherCompetitionsPage.tsx",
  "apps/web/src/app/pages/live-log/ReciterAccessCard.tsx",
  "apps/web/src/app/pages/prog-dept/ProgramsArchivePage.tsx",
  "apps/web/src/app/pages/prog-dept/QuizBuilderPage.tsx",
  "apps/web/src/app/pages/public/PublicQuizPage.tsx",
  "apps/web/src/app/pages/quiz/QuizPublicPage.tsx",
];

function importPath(rel) {
  const fromDir = path.dirname(path.join(root, rel));
  const target = path.join(root, "apps/web/src/app/components/ui/guarded-form.tsx");
  let relPath = path.relative(fromDir, target).replace(/\\/g, "/");
  if (!relPath.startsWith(".")) relPath = `./${relPath}`;
  return relPath.replace(/\.tsx$/, "");
}

for (const rel of files) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes("<form")) continue;
  s = s.replace(/<form\b/g, "<GuardedForm").replace(/<\/form>/g, "</GuardedForm>");
  if (!s.includes("guarded-form")) {
    const line = `import { GuardedForm } from "${importPath(rel)}";\n`;
    const m = s.match(/^import .+\n/m);
    s = m ? s.replace(m[0], m[0] + line) : line + s;
  }
  fs.writeFileSync(fp, s);
  console.log("OK", rel);
}
