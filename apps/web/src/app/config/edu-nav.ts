export type EduNavItem = {

  id: string;

  label: string;

  path: string;

};



/** عناصر القائمة الجانبية الموحّدة للمشرف التعليمي */

export const EDU_NAV_ITEMS: EduNavItem[] = [

  { id: "dashboard", label: "لوحة المتابعة", path: "/edu-supervisor/dashboard" },

  {
    id: "matrix-console",
    label: "شبكة الطلاب (مسطّحة)",
    path: "/edu-supervisor/matrix-console",
  },

  {
    id: "matrix-competition",
    label: "منافسة زمنية (شبكة)",
    path: "/edu-supervisor/matrix-competition",
  },

  { id: "placement", label: "انتظار التسكين", path: "/edu-supervisor/placement" },

  { id: "students", label: "الطلاب و Excel", path: "/edu-supervisor/students" },

  { id: "transfers", label: "نقل الطلاب", path: "/edu-supervisor/transfers" },

  { id: "circles", label: "الحلقات التشغيلية", path: "/edu-supervisor/circles" },

  { id: "competitions", label: "المنافسات والبرامج", path: "/edu-supervisor/competitions" },

  { id: "yom-himma", label: "يوم الهمة القرآني", path: "/edu-supervisor/yom-himma" },

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

  if (itemPath === "/edu-supervisor/competitions") {

    return (

      pathname === "/edu-supervisor/competitions" ||

      pathname.startsWith("/edu-supervisor/competitions/")

    );

  }

  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);

}

