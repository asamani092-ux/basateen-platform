export type EduNavItem = {

  id: string;

  label: string;

  path: string;

};



/** عناصر القائمة الجانبية الموحّدة للمشرف التعليمي */

export const EDU_NAV_ITEMS: EduNavItem[] = [

  { id: "dashboard", label: "لوحة المتابعة", path: "/edu-supervisor/dashboard" },

  {
    id: "master-grid",
    label: "انتظار القبول والتوزيع",
    path: "/edu-supervisor/master-grid",
  },

  { id: "students", label: "الطلاب و Excel", path: "/edu-supervisor/students" },

  { id: "transfers", label: "نقل الطلاب", path: "/edu-supervisor/transfers" },

  { id: "circles", label: "الحلقات التشغيلية", path: "/edu-supervisor/circles" },

  { id: "events-engine", label: "محرك الفعاليات", path: "/edu-supervisor/events-engine" },

];



export function isEduNavActive(itemPath: string, pathname: string): boolean {

  if (itemPath === "/edu-supervisor/dashboard") {

    return pathname === "/edu-supervisor" || pathname === "/edu-supervisor/dashboard";

  }

  if (itemPath === "/edu-supervisor/students") {

    return (

      pathname === "/edu-supervisor/students" ||

      pathname.startsWith("/edu-supervisor/students/")

    );

  }

  if (itemPath === "/edu-supervisor/events-engine") {

    return (

      pathname === "/edu-supervisor/events-engine" ||

      pathname === "/edu-supervisor/yom-himma" ||

      pathname === "/edu-supervisor/competitions" ||

      pathname.startsWith("/edu-supervisor/competitions/")

    );

  }

  if (itemPath === "/edu-supervisor/master-grid") {

    return (

      pathname === "/edu-supervisor/master-grid" ||

      pathname === "/edu-supervisor/placement"

    );

  }

  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);

}

