import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";

const TAB_TO_PATH: Record<string, string> = {
  placement: "/edu-supervisor/placement",
  students: "/edu-supervisor/students",
  transfers: "/edu-supervisor/transfers",
  circles: "/edu-supervisor/circles",
  education: "/edu-supervisor/competitions",
  dashboard: "/edu-supervisor/dashboard",
  attendance: "/edu-supervisor/placement",
};

/** يحوّل /edu-supervisor?tab=... إلى المسارات الجديدة في القائمة الجانبية */
export function EduLegacyTabRedirect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = searchParams.get("tab");

  useEffect(() => {
    if (!tab) return;
    const base = TAB_TO_PATH[tab];
    if (!base) return;
    const excel = searchParams.get("excel");
    const extra = searchParams.get("student");
    const qs = new URLSearchParams();
    if (excel === "1") qs.set("excel", "1");
    if (extra) qs.set("student", extra);
    const suffix = qs.toString() ? `?${qs}` : "";
    navigate(`${base}${suffix}`, { replace: true });
  }, [tab, searchParams, navigate]);

  return null;
}
