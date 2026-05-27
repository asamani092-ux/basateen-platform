import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api, type ReciterGateResponse } from "../../lib/api-client";
import { tajawal } from "../../lib/design-system";

const RECITER_STORAGE_PREFIX = "basateen_reciter_session_";
const GATE_CACHE_PREFIX = "basateen_reciter_gate_";

export function reciterStorageKey(liveToken: string): string {
  return `${RECITER_STORAGE_PREFIX}${liveToken}`;
}

export function writeReciterSession(liveToken: string, jwt: string): void {
  sessionStorage.setItem(reciterStorageKey(liveToken), jwt);
}

export function writeReciterGateCache(
  liveToken: string,
  payload: ReciterGateResponse,
): void {
  sessionStorage.setItem(
    `${GATE_CACHE_PREFIX}${liveToken}`,
    JSON.stringify(payload),
  );
  writeReciterSession(liveToken, payload.session_token);
}

export function readReciterGateCache(
  liveToken: string,
): ReciterGateResponse | null {
  try {
    const raw = sessionStorage.getItem(`${GATE_CACHE_PREFIX}${liveToken}`);
    if (!raw) return null;
    return JSON.parse(raw) as ReciterGateResponse;
  } catch {
    return null;
  }
}

type Props = {
  liveToken: string;
  onSuccess: (payload: ReciterGateResponse) => void;
};

export function ReciterAccessCard({ liveToken, onSuccess }: Props) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.reciterValidateGate(liveToken, pin.trim());
      writeReciterGateCache(liveToken, data);
      onSuccess(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "رمز الدخول غير صحيح أو الرابط منتهي",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-6"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-full bg-emerald-600/20 flex items-center justify-center">
            <Lock className="h-8 w-8 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center mb-2" style={tajawal}>
          بوابة المقرئ الميدانية
        </h1>
        <p className="text-sm text-zinc-400 text-center mb-8" style={tajawal}>
          أدخل رمز دخول المقرئين الممنوح من المشرف
        </p>

        <form onSubmit={submit} className="space-y-4">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="مثل: 8890"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="h-16 text-2xl text-center tracking-[0.3em] bg-zinc-950 border-zinc-700 rounded-2xl"
            style={tajawal}
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-400 text-center" style={tajawal}>
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={loading || !pin.trim()}
            className="w-full h-14 text-lg rounded-2xl bg-emerald-600 hover:bg-emerald-500"
            style={tajawal}
          >
            {loading ? "جاري التحقق…" : "دخول شبكة الرصد"}
          </Button>
        </form>
      </div>
    </div>
  );
}
