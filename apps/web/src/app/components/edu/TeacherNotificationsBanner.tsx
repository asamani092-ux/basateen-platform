import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { useAuth } from "../../context/AuthContext";
import { ds, tajawal } from "../../lib/design-system";
import { queryKeys } from "../../lib/query-keys";
import {
  todayRecitationDate,
  type TeacherBootstrapNotification,
} from "../../lib/teacher-bootstrap";

type Notice = {
  id: number;
  title_ar: string;
  body_ar: string;
};

function isNoCircleNotice(n: Notice): boolean {
  const blob = `${n.title_ar} ${n.body_ar}`.toLowerCase();
  return (
    blob.includes("no_circle_assigned") ||
    blob.includes("لم يتم ربط حلقة") ||
    blob.includes("لم يتم ربط") ||
    blob.includes("no circle")
  );
}

export function TeacherNotificationsBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [trackSupervisorItems, setTrackSupervisorItems] = useState<Notice[]>([]);
  const [trackSupervisorHasTrack, setTrackSupervisorHasTrack] = useState(false);

  const isTeacher = user?.role === "teacher";
  const isTrackSupervisor = user?.role === "track_supervisor";
  const today = todayRecitationDate();

  const bootstrapQuery = useQuery({
    queryKey: queryKeys.eduDept.teacherBootstrap(today),
    queryFn: () => api.eduDeptTeacherBootstrap({ date: today }),
    enabled: canUseApi() && isTeacher,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const loadTrackSupervisorNotices = useCallback(async () => {
    if (!canUseApi() || !isTrackSupervisor) return;
    try {
      const res = await api.eduDeptNotifications();
      setTrackSupervisorItems(res.items);
    } catch {
      setTrackSupervisorItems([]);
    }
  }, [isTrackSupervisor]);

  useEffect(() => {
    if (!isTrackSupervisor) return;
    void loadTrackSupervisorNotices();
    const t = setInterval(() => void loadTrackSupervisorNotices(), 60_000);
    return () => clearInterval(t);
  }, [isTrackSupervisor, loadTrackSupervisorNotices]);

  useEffect(() => {
    if (!canUseApi() || !isTrackSupervisor) {
      setTrackSupervisorHasTrack(false);
      return;
    }
    void api
      .eduDeptFilterScopes()
      .then((res) => {
        const assigned = res.assigned_track_ids ?? [];
        setTrackSupervisorHasTrack(assigned.length > 0);
      })
      .catch(() => setTrackSupervisorHasTrack(false));
  }, [isTrackSupervisor]);

  const teacherItems: Notice[] = useMemo(
    () =>
      (bootstrapQuery.data?.notifications.items ?? []).map((n: TeacherBootstrapNotification) => ({
        id: n.id,
        title_ar: n.title_ar,
        body_ar: n.body_ar,
      })),
    [bootstrapQuery.data?.notifications.items],
  );

  const items = isTeacher ? teacherItems : trackSupervisorItems;

  const visibleItems = useMemo(() => {
    if (!isTrackSupervisor || !trackSupervisorHasTrack) {
      return items;
    }
    return items.filter((n) => !isNoCircleNotice(n));
  }, [items, isTrackSupervisor, trackSupervisorHasTrack]);

  if (visibleItems.length === 0) return null;

  async function dismiss(id: number) {
    try {
      await api.eduDeptNotificationDismiss(id);
      if (isTeacher) {
        queryClient.setQueryData(
          queryKeys.eduDept.teacherBootstrap(today),
          (prev: typeof bootstrapQuery.data | undefined) => {
            if (!prev) return prev;
            return {
              ...prev,
              notifications: {
                items: prev.notifications.items.filter((n) => n.id !== id),
              },
            };
          },
        );
      } else {
        setTrackSupervisorItems((prev) => prev.filter((n) => n.id !== id));
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-2 mb-4 print:hidden">
      {visibleItems.map((n) => (
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
