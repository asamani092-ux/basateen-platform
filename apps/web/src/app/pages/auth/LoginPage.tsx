import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { useAuth } from "../../context/AuthContext";
import { normalizeMobile } from "../../lib/auth-store";
import {
  apiTokenSyncErrorMessage,
  syncApiTokenForMobile,
} from "../../lib/api-token";
import { isUiDevPreview } from "../../lib/dev-preview";
import { ds, tajawal } from "../../lib/design-system";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, logout, isAuthenticated, user } = useAuth();
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalized = useMemo(() => normalizeMobile(mobile), [mobile]);
  const canSubmit = Boolean(normalized) && !loading;

  function handleLogout() {
    logout();
    setError(null);
    setMobile("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!normalized) {
      setError("أدخل رقم جوال سعودي صحيح (مثال: 0500000001)");
      return;
    }
    setLoading(true);
    const authUser = login(mobile);
    if (!authUser) {
      setLoading(false);
      setError("رقم الجوال غير مسجّل في النظام");
      return;
    }
    const apiOk = await syncApiTokenForMobile(mobile);
    setLoading(false);
    if (!apiOk && !isUiDevPreview() && authUser.role !== "teacher") {
      setError("تعذّر ربط API — تحقق من نشر Worker وحسابات seed");
      return;
    }
    navigate(authUser.homePath, { replace: true });
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-background flex items-center justify-center p-4 sm:p-6"
      dir="rtl"
    >
      <Card className={`w-full max-w-md ${ds.card}`}>
        <CardHeader className="text-center pb-2">
          <img
            src="/logo-light.png"
            alt="منصة بساتين"
            className="h-32 sm:h-36 w-auto object-contain mx-auto mb-6 dark:hidden"
          />
          <img
            src="/logo-dark.png"
            alt="منصة بساتين"
            className="h-32 sm:h-36 w-auto object-contain mx-auto mb-6 hidden dark:block"
          />
          <h1
            className="text-2xl sm:text-3xl font-bold text-foreground"
            style={tajawal}
          >
            منصة بساتين
          </h1>
          <p className="text-sm text-muted-foreground mt-2" style={tajawal}>
            أدخل رقم الجوال المسجّل
          </p>
        </CardHeader>
        <CardContent>
          {isAuthenticated && user && (
            <div className={`mb-4 ${ds.alert.info}`}>
              <p style={tajawal}>
                أنت مسجّل كـ <strong>{user.full_name_ar}</strong>
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button
                  type="button"
                  variant="outline"
                  className={ds.btnRound}
                  style={tajawal}
                  onClick={() => navigate(user.homePath)}
                >
                  الذهاب للوحة العمل
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className={ds.btnRound}
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
                className="block text-sm font-semibold mb-2 text-foreground"
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
                className={`${ds.btnRound} text-foreground`}
                style={tajawal}
                dir="ltr"
                required
              />
            </div>
            {error && (
              <p className={`text-sm ${ds.alert.error}`} style={tajawal}>
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={!canSubmit}
              className={`w-full ${ds.btnRound} disabled:opacity-50`}
              style={tajawal}
            >
              {loading ? "جاري الدخول..." : "دخول"}
            </Button>
            <p
              className="text-xs text-muted-foreground text-center leading-relaxed"
              style={tajawal}
            >
              تجريبي: 0500000001 مدير · 0500000002 تعليمي · 0500000003 برامج
              (اختبارات) · 0500000004 مشرف عام · 0500000005 معلم
            </p>
            {isUiDevPreview() && (
              <p className={`text-xs text-center ${ds.alert.info}`} style={tajawal}>
                معاينة UI: أمثلة تسكين، خطط، منافسات، يوم همة، رصد مشارك —
                راجع docs/DEV-EXAMPLES.md
              </p>
            )}
          </form>

          <p className="text-center mt-4">
            <Link
              to="/tv-live"
              className="text-sm text-primary hover:underline"
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
