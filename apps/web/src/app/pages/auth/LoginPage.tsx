import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function LoginPage() {
  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-[#0a1628] flex items-center justify-center p-6"
      dir="rtl"
    >
      <Card className="w-full max-w-md rounded-3xl border-slate-200 dark:border-[#1e3a5f] shadow-lg">
        <CardHeader className="text-center">
          <img
            src="/logo-light.png"
            alt="مجمع حلقات البساتين"
            className="h-20 w-auto object-contain mx-auto mb-4"
          />
          <CardTitle className="text-xl" style={tajawal}>
            تسجيل الدخول
          </CardTitle>
          <CardDescription style={tajawal}>
            مجمع حلقات البساتين
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2" style={tajawal}>
              البريد الإلكتروني
            </label>
            <Input
              type="email"
              placeholder="admin@basateen.local"
              className="rounded-xl border-slate-300 dark:border-[#1e3a5f]"
              style={tajawal}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2" style={tajawal}>
              كلمة المرور
            </label>
            <Input
              type="password"
              className="rounded-xl border-slate-300 dark:border-[#1e3a5f]"
              style={tajawal}
            />
          </div>
          <Button
            className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl"
            style={tajawal}
            type="button"
          >
            دخول (قريباً)
          </Button>
          <Link
            to="/"
            className="block text-center text-sm text-[#1e3a8a] hover:underline"
            style={tajawal}
          >
            الدخول للوحة بدون حساب (تطوير)
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
