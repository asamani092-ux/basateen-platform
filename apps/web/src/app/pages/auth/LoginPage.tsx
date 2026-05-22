import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { setToken } from "../../lib/auth-store";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@basateen.local");
  const [password, setPassword] = useState("Basateen123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      setToken(res.token);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

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
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2" style={tajawal}>
                البريد الإلكتروني
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border-slate-300 dark:border-[#1e3a5f]"
                style={tajawal}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2" style={tajawal}>
                كلمة المرور
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border-slate-300 dark:border-[#1e3a5f]"
                style={tajawal}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-rose-600" style={tajawal}>
                {error === "invalid_credentials"
                  ? "بيانات الدخول غير صحيحة"
                  : error}
              </p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl"
              style={tajawal}
            >
              {loading ? "جاري الدخول..." : "دخول"}
            </Button>
            <p className="text-xs text-slate-500 text-center" style={tajawal}>
              تجريبي: admin@basateen.local / Basateen123!
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
