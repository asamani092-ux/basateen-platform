import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { canUseApi } from "../lib/api-access";
import { queryKeys } from "../lib/query-keys";
import { useAuth } from "../context/AuthContext";
import { todayRecitationDate } from "../lib/teacher-bootstrap";

export function useTeacherBootstrap(date: string, enabled = true) {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";

  return useQuery({
    queryKey: queryKeys.eduDept.teacherBootstrap(date),
    queryFn: () => api.eduDeptTeacherBootstrap({ date }),
    enabled: enabled && canUseApi() && isTeacher,
    staleTime: 60_000,
  });
}

/** Prefetch on shell mount so banner + daily tab share one network round-trip. */
export function prefetchTeacherBootstrap(
  queryClient: QueryClient,
  date = todayRecitationDate(),
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.eduDept.teacherBootstrap(date),
    queryFn: () => api.eduDeptTeacherBootstrap({ date }),
    staleTime: 60_000,
  });
}

export async function invalidateTeacherBootstrapQueries(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.eduDept.teacherBootstrapAll,
  });
}
