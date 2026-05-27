import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  readReciterGateCache,
  ReciterAccessCard,
} from "./ReciterAccessCard";
import { FuzzyReciterConsole } from "./FuzzyReciterConsole";
import type { ReciterGateResponse } from "../../lib/api-client";
import { tajawal } from "../../lib/design-system";

export function LiveLogPage() {
  const { token } = useParams<{ token: string }>();
  const [gate, setGate] = useState<ReciterGateResponse | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    setGate(readReciterGateCache(token));
    setBooting(false);
  }, [token]);

  if (!token) {
    return (
      <p className="p-8 text-center text-muted-foreground" style={tajawal}>
        رابط غير صالح
      </p>
    );
  }

  if (booting) {
    return (
      <p className="p-8 text-center text-muted-foreground" style={tajawal}>
        جاري التحميل…
      </p>
    );
  }

  if (gate) {
    return (
      <FuzzyReciterConsole sessionToken={gate.session_token} gate={gate} />
    );
  }

  return (
    <ReciterAccessCard liveToken={token} onSuccess={(data) => setGate(data)} />
  );
}
