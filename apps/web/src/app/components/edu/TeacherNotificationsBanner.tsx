import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { useAuth } from "../../context/AuthContext";
import { ds, tajawal } from "../../lib/design-system";

type Notice = {
  id: number;
  title_ar: string;
  body_ar: string;
};

export function TeacherNotificationsBanner() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notice[]>([]);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    if (user?.role !== "teacher" && user?.role !== "track_supervisor") return;
    try {
      const res = await api.eduDeptNotifications();
      setItems(res.items);
    } catch {
      setItems([]);
    }
  }, [user?.role]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (items.length === 0) return null;

  async function dismiss(id: number) {
    try {
      await api.eduDeptNotificationDismiss(id);
      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-2 mb-4 print:hidden">
      {items.map((n) => (
        <div
          key={n.id}
          className={`${ds.alert.success} flex items-start justify-between gap-3`}
          role="alert"
        >
          <div className="min-w-0">
            <p className="font-semibold text-sm" style={tajawal}>
              {n.title_ar}
            </p>
            <p className="text-sm mt-0.5" style={tajawal}>
              {n.body_ar}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="إخفاء"
            onClick={() => void dismiss(n.id)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
