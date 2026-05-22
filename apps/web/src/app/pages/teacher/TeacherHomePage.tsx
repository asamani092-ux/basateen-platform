import { Link } from "react-router";
import { ClipboardList, ListTodo } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function TeacherHomePage() {
  return (
    <div className="space-y-4">
      <h2
        className="text-xl font-bold text-slate-900 dark:text-white"
        style={tajawal}
      >
        مرحباً — رصد الحلقة
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-300" style={tajawal}>
        واجهة محسّنة للجوال داخل الحلقة
      </p>

      <div className="grid gap-3">
        <Card className="rounded-2xl border-slate-200 dark:border-[#1e3a5f]">
          <CardHeader className="pb-2">
            <CardTitle
              className="text-base flex items-center gap-2 text-slate-900 dark:text-white"
              style={tajawal}
            >
              <ClipboardList className="w-5 h-5 text-[#1e3a8a]" />
              الرصد اليومي
            </CardTitle>
            <CardDescription
              className="text-slate-600 dark:text-slate-300"
              style={tajawal}
            >
              تسجيل حضور وغياب الطلاب
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl"
              style={tajawal}
            >
              <Link to="/teacher/daily-log">فتح الرصد</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 dark:border-[#1e3a5f]">
          <CardHeader className="pb-2">
            <CardTitle
              className="text-base flex items-center gap-2 text-slate-900 dark:text-white"
              style={tajawal}
            >
              <ListTodo className="w-5 h-5 text-[#1e3a8a]" />
              المهام التعليمية
            </CardTitle>
            <CardDescription
              className="text-slate-600 dark:text-slate-300"
              style={tajawal}
            >
              قريباً
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
