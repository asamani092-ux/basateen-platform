import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** نطاقات بيانات القسم الإداري — Time O(1) لكل invalidate؛ Space O(k) حيث k عدد النطاقات */
export type AdminDataDomain = "students" | "groups" | "staff";

type Versions = Record<AdminDataDomain, number>;

const INITIAL: Versions = { students: 0, groups: 0, staff: 0 };

type AdminDataSyncContextValue = {
  versions: Versions;
  invalidate: (domains: AdminDataDomain | AdminDataDomain[]) => void;
};

const AdminDataSyncContext = createContext<AdminDataSyncContextValue | null>(
  null,
);

/** خريطة الربط المتقاطع: أي عملية تُحدّث أي تبويبات */
export function adminInvalidateFor(
  entity: "student" | "group" | "staff",
): AdminDataDomain[] {
  switch (entity) {
    case "student":
      return ["students", "groups"];
    case "group":
      return ["groups", "students", "staff"];
    case "staff":
      return ["staff", "groups"];
  }
}

export function AdminDataSyncProvider({ children }: { children: ReactNode }) {
  const [versions, setVersions] = useState<Versions>({ ...INITIAL });

  const invalidate = useCallback((domains: AdminDataDomain | AdminDataDomain[]) => {
    const list = Array.isArray(domains) ? domains : [domains];
    setVersions((prev) => {
      const next = { ...prev };
      for (const d of list) {
        next[d] += 1;
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ versions, invalidate }),
    [versions, invalidate],
  );

  return (
    <AdminDataSyncContext.Provider value={value}>
      {children}
    </AdminDataSyncContext.Provider>
  );
}

export function useAdminDataSyncContext(): AdminDataSyncContextValue {
  const ctx = useContext(AdminDataSyncContext);
  if (!ctx) {
    return {
      versions: INITIAL,
      invalidate: () => {},
    };
  }
  return ctx;
}

/**
 * يستمع لتغيّر إصدارات النطاقات ويستدعي refetch عند إبطال الكاش.
 * Time O(d) لكل تغيير حيث d = عدد النطاقات المراقبة.
 */
export function useAdminDataSync(
  domains: AdminDataDomain[],
  refetch: () => void | Promise<void>,
): void {
  const { versions } = useAdminDataSyncContext();
  const prev = useRef<Versions>({ ...versions });
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      prev.current = { ...versions };
      return;
    }
    const changed = domains.some((d) => versions[d] !== prev.current[d]);
    if (changed) {
      void refetch();
    }
    prev.current = { ...versions };
  }, [versions, domains, refetch]);
}
