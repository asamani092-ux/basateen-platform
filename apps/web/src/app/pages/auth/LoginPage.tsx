import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { useAuth } from "../../context/AuthContext";
import {
  loginWithApiUser,
  loginWithMobile,
  normalizeMobile,
  type UserRole,
} from "../../lib/auth-store";
import { setApiToken } from "../../lib/api-token";
import { api } from "../../lib/api-client";
import { ROLE_HOME } from "../../config/role-access";
import { isUiDevPreview } from "../../lib/dev-preview";
import { ds, tajawal } from "../../lib/design-system";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [useEmail, setUseEmail] = useState(false);
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
  const canSubmitEmail =
    Boolean(email.trim() && password) && !loading && !isUiDevPreview();

  function finishLogin(
    res: { token: string; user: { id: number; full_name_ar: string; role: string; sections: string[] } },
    rawMobile: string,
  ) {
    setApiToken(res.token);
    const role = res.user.role as UserRole;
    const authUser = loginWithApiUser(
      {
        id: res.user.id,
        full_name_ar: res.user.full_name_ar,
        role,
        sections: res.user.sections,
      },
      rawMobile || res.user.id.toString(),
      ROLE_HOME[role] ?? "/welcome",
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
      return;
    } catch {
      if (isUiDevPreview()) {
        const mockUser = loginWithMobile(mobile) ?? login(mobile);
        if (mockUser) {
          navigate(mockUser.homePath, { replace: true });
          return;
        }
      }
      setError(
        "رقم الجوال غير مسجّل أو غير متطابق مع D1 — جرّب 0500000000 أو 966500000000، أو الدخول بالإيميل",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email.trim().toLowerCase(), password);
      finishLogin(res, mobile || "0500000000");
    } catch {
      setError("بيانات الدخول غير صحيحة — تحقق من الإيميل وكلمة المرور");
    } finally {
      setLoading(false);
    }
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
            {useEmail ? "دخول المشرف السيادي بالإيميل" : "أدخل رقم الجوال المسجّل في D1"}
          </p>
        </CardHeader>
        <CardContent>
          {!useEmail ? (
            <form onSubmit={onSubmitMobile} className="space-y-4">
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
            </form>
          ) : (
            <form onSubmit={onSubmitEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2" style={tajawal}>
                  الإيميل
                </label>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="admin@basateen.win"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={ds.btnRound}
                  dir="ltr"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={tajawal}>
                  كلمة المرور
                </label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={ds.btnRound}
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
                disabled={!canSubmitEmail}
                className={`w-full ${ds.btnRound}`}
                style={tajawal}
              >
                {loading ? "جاري الدخول..." : "دخول بالإيميل"}
              </Button>
            </form>
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full mt-3 text-sm"
            style={tajawal}
            onClick={() => {
              setUseEmail((v) => !v);
              setError(null);
            }}
          >
            {useEmail ? "العودة لدخول الجوال" : "دخول بالإيميل (المشرف السيادي)"}
          </Button>

          {isUiDevPreview() && (
            <p className={`text-xs text-center mt-3 ${ds.alert.info}`} style={tajawal}>
              وضع معاينة UI — الجوال التجريبي: 0500000001 … 0500000005
            </p>
          )}

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
