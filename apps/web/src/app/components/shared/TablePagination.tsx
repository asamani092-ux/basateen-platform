import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { ds, tajawal } from "../../lib/design-system";

export type PageInfo = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_prev: boolean;
  has_next: boolean;
};

type Props = {
  page: PageInfo;
  onPageChange: (page: number) => void;
  className?: string;
};

export function TablePagination({ page, onPageChange, className }: Props) {
  return (
    <div
      className={`flex items-center justify-between gap-3 pt-3 ${className ?? ""}`}
      style={tajawal}
    >
      <p className="text-sm text-muted-foreground">
        صفحة {page.page} من {page.total_pages} — {page.total} سجل
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ds.btnRound}
          disabled={!page.has_prev}
          onClick={() => onPageChange(page.page - 1)}
        >
          <ChevronRight className="w-4 h-4" />
          السابق
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ds.btnRound}
          disabled={!page.has_next}
          onClick={() => onPageChange(page.page + 1)}
        >
          التالي
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
