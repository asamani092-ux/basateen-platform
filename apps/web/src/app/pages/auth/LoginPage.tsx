import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useAuth } from "../../context/AuthContext";
import { normalizeMobile } from "../../lib/auth-store";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, logout, isAuthenticated, user } = useAuth();
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalized = useMemo(() => normalizeMobile(mobile), [mobile]);
  const canSubmit = Boolean(normalized) && !loading;

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.homePath, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  function handleLogout() {
    logout();
    setError(null);
    setMobile("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!normalized) {
      setError("أدخل رقم جوال سعودي صحيح (مثال: 0500000001)");
      return;
    }
    setLoading(true);
    const authUser = login(mobile);
    setLoading(false);
    if (!authUser) {
      setError("رقم الجوال غير مسجّل في النظام");
      return;
    }
    navigate(authUser.homePath, { replace: true });
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-slate-50 dark:bg-[#0a1628] flex items-center justify-center p-4 sm:p-6"
      dir="rtl"
    >
      <Card className="w-full max-w-md rounded-3xl border-slate-200 dark:border-[#1e3a5f] shadow-lg">
        <CardHeader className="text-center">
          <img
            src="/logo-light.png"
            alt="مجمع حلقات البساتين"
            className="h-20 w-auto object-contain mx-auto mb-4"
          />
          <CardTitle
            className="text-xl text-slate-900 dark:text-white"
            style={tajawal}
          >
            تسجيل الدخول
          </CardTitle>
          <CardDescription
            className="text-slate-600 dark:text-slate-300"
            style={tajawal}
          >
            أدخل رقم الجوال المسجّل — بدون بريد أو كلمة مرور
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAuthenticated && user && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm space-y-2">
              <p className="text-amber-900 dark:text-amber-200" style={tajawal}>
                أنت مسجّل كـ <strong>{user.full_name_ar}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl text-slate-800 dark:text-slate-200"
                  style={tajawal}
                  onClick={() => navigate(user.homePath)}
                >
                  الذهاب للوحة التحكم
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-xl"
                  style={tajawal}
                  onClick={handleLogout}
                >
                  تسجيل خروج
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                className="block text-sm font-semibold mb-2 text-slate-900 dark:text-white"
                style={tajawal}
              >
                رقم الجوال
              </label>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="05xxxxxxxx"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="rounded-xl border-slate-300 dark:border-[#1e3a5f] text-slate-900 dark:text-white bg-white dark:bg-[#132337]"
                style={tajawal}
                dir="ltr"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-rose-600 dark:text-rose-400" style={tajawal}>
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl disabled:opacity-50"
              style={tajawal}
            >
              {loading ? "جاري الدخول..." : "دخول"}
            </Button>
            <p
              className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed"
              style={tajawal}
            >
              تجريبي: 0500000001 مدير · 0500000002 مشرف · 0500000003 معلم
            </p>
          </form>

          <p className="text-center mt-4">
            <Link
              to="/tv-live"
              className="text-sm text-[#1e3a8a] dark:text-[#3b82f6] hover:underline"
              style={tajawal}
            >
              شاشة التلفاز (بدون دخول)
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
