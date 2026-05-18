import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f] shadow-sm max-w-2xl">
      <CardHeader>
        <CardTitle style={tajawal}>{title}</CardTitle>
        <CardDescription style={tajawal}>
          هذه الصفحة جاهزة في الهيكل — سيتم برمجة المحتوى في المرحلة التالية.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-slate-600 dark:text-slate-300 text-sm" style={tajawal}>
        استخدم مكونات دليل الهوية فقط عند التنفيذ.
      </CardContent>
    </Card>
  );
}
