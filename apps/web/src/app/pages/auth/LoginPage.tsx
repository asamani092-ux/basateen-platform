import { useEffect, useMemo, useState } from "react";
import { GuardedForm } from "../../components/ui/guarded-form";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { useAuth } from "../../context/AuthContext";
import {
  loginWithApiUser,
  loginWithMobile,
  normalizeClientRole,
  normalizeMobile,
} from "../../lib/auth-store";
import { setApiToken } from "../../lib/api-token";
import { api } from "../../lib/api-client";
import { roleHomePath } from "../../config/role-access";
import { isUiDevPreview } from "../../lib/dev-preview";
import { ThemeToggle } from "../../components/ThemeToggle";
import { ds, tajawal } from "../../lib/design-system";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("reason") !== "session_reset") return;
    logout();
    navigate("/login", { replace: true });
  }, [searchParams, navigate, logout]);

  const normalized = useMemo(() => normalizeMobile(mobile), [mobile]);
  const canSubmitMobile = Boolean(normalized) && !loading;

  function finishLogin(
    res: {
      token: string;
      user: { id: number; full_name_ar: string; role: string; sections: string[] };
    },
    rawMobile: string,
  ) {
    setApiToken(res.token);
    const role = normalizeClientRole(res.user.role);
    const authUser = loginWithApiUser(
      {
        id: res.user.id,
        full_name_ar: res.user.full_name_ar,
        role,
        sections: res.user.sections,
      },
      rawMobile,
      roleHomePath(role),
    );
    if (!authUser) {
      setError("تعذّر إنشاء الجلسة");
      return;
    }
    window.dispatchEvent(new Event("basateen-auth"));
    navigate(authUser.homePath, { replace: true });
  }

  async function onSubmitMobile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!normalized) {
      setError("أدخل رقم جوال سعودي صحيح (مثال: 0500000000)");
      return;
    }
    setLoading(true);
    try {
      const res = await api.loginMobile(mobile);
      finishLogin(res, mobile);
    } catch {
      if (isUiDevPreview()) {
        const mockUser = loginWithMobile(mobile) ?? login(mobile);
        if (mockUser) {
          navigate(mockUser.homePath, { replace: true });
          return;
        }
      }
      setError(
        "رقم الجوال غير مسجّل — تحقق من الرقم (مثال: 0500000000 أو 966500000000)",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-4 sm:p-6 relative"
      dir="rtl"
    >
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
        <ThemeToggle />
      </div>
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
            أدخل رقم الجوال المسجّل في النظام
          </p>
        </CardHeader>
        <CardContent>
          <GuardedForm onSubmit={onSubmitMobile} className="space-y-4">
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
                placeholder="05xxxxxxxx أو 9665xxxxxxxx"
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
              disabled={!canSubmitMobile}
              className={`w-full ${ds.btnRound} disabled:opacity-50`}
              style={tajawal}
            >
              {loading ? "جاري الدخول..." : "دخول"}
            </Button>
          </GuardedForm>

          {isUiDevPreview() && (
            <p className={`text-xs text-center mt-3 ${ds.alert.info}`} style={tajawal}>
              وضع معاينة UI — الجوال التجريبي: 0500000001 … 0500000005
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
