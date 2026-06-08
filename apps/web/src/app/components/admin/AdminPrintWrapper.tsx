import type { ReactNode } from "react";
import { tajawal } from "../../lib/design-system";

const DEFAULT_COMPLEX = "مجمع حلقات البساتين";

type AdminPrintWrapperProps = {
  title: string;
  complexName?: string;
  showPledgeSignature?: boolean;
  children: ReactNode;
  className?: string;
};

/** حاوية طباعة موحّدة للتقارير والتعهدات — الترويسة تظهر في الطباعة فقط */
export function AdminPrintWrapper({
  title,
  complexName = DEFAULT_COMPLEX,
  showPledgeSignature = false,
  children,
  className = "",
}: AdminPrintWrapperProps) {
  const printDate = new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className={`print:bg-white print:text-black print:dark:bg-white print:dark:text-black ${className}`}
      dir="rtl"
    >
      <div className="hidden print:flex justify-between items-start gap-4 mb-2">
        <p className="text-right font-bold text-lg print:text-black" style={tajawal}>
          {complexName}
        </p>
        <p className="text-left text-sm print:text-black shrink-0" style={tajawal}>
          {printDate}
        </p>
      </div>
      <h2
        className="hidden print:block text-center font-bold text-xl my-3 print:text-black"
        style={tajawal}
      >
        {title}
      </h2>
      <hr className="hidden print:block border-black border-2 my-4" />
      {children}
      {showPledgeSignature ? (
        <div
          className="hidden print:block text-right font-bold mt-12 print:text-black"
          style={tajawal}
        >
          توقيع ولي الأمر: ........................
        </div>
      ) : null}
    </div>
  );
}
