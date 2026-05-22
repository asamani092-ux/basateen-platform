import { Link } from "react-router";
import { Archive, FileQuestion } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function ProgramsHomePage() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h2
          className="text-2xl font-bold text-slate-900 dark:text-white"
          style={tajawal}
        >
          البرامج والاختبارات
        </h2>
        <p className="text-slate-600 dark:text-slate-300 mt-1" style={tajawal}>
          القسم د — إدارة البرامج والأرشيف
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f]">
          <CardHeader>
            <CardTitle
              className="flex items-center gap-2 text-slate-900 dark:text-white"
              style={tajawal}
            >
              <FileQuestion className="w-5 h-5 text-[#1e3a8a]" />
              الاختبارات
            </CardTitle>
            <CardDescription
              className="text-slate-600 dark:text-slate-300"
              style={tajawal}
            >
              إنشاء وإدارة الاختبارات
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              className="bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl"
              style={tajawal}
            >
              <Link to="/programs/quizzes">فتح الاختبارات</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f]">
          <CardHeader>
            <CardTitle
              className="flex items-center gap-2 text-slate-900 dark:text-white"
              style={tajawal}
            >
              <Archive className="w-5 h-5 text-[#1e3a8a]" />
              الأرشيف
            </CardTitle>
            <CardDescription
              className="text-slate-600 dark:text-slate-300"
              style={tajawal}
            >
              البرامج والأنشطة المؤرشفة
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              variant="outline"
              className="rounded-xl border-[#1e3a8a] text-[#1e3a8a] dark:text-[#3b82f6]"
              style={tajawal}
            >
              <Link to="/programs/archive">فتح الأرشيف</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
