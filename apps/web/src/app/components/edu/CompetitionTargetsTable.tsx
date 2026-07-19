import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { TablePagination } from "../shared/TablePagination";
import { paginateSlice } from "../../lib/competition-table-pagination";
import { tajawal } from "../../lib/design-system";

export type CompetitionTargetRow = {
  student_id: number;
  full_name_ar: string;
  current_memorization: number | string;
  target_amount: number | string;
  achieved_amount?: number | string;
};

type Props = {
  targets: CompetitionTargetRow[];
  saving: boolean;
  editingTargetId: number | null;
  editTargetAmount: string;
  onEditTargetAmountChange: (value: string) => void;
  onStartEdit: (row: CompetitionTargetRow) => void;
  onCancelEdit: () => void;
  onSaveEdit: (studentId: number) => void;
  onRemove: (studentId: number) => void;
  memorizationLabel: (juz: number | string) => string;
};

/** جدول المستهدفين — ترقيم صفحات؛ O(pageSize) صفوف في DOM */
export function CompetitionTargetsTable({
  targets,
  saving,
  editingTargetId,
  editTargetAmount,
  onEditTargetAmountChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
  memorizationLabel,
}: Props) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [targets.length]);

  const slice = useMemo(() => paginateSlice(targets, page), [targets, page]);

  if (targets.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" style={tajawal}>
        لا مستهدفين — أُنشئت المنافسة بدون طلاب.
      </p>
    );
  }

  return (
    <>
      <table className="w-full text-sm" style={tajawal}>
        <thead className="bg-muted/40">
          <tr>
            <th className="text-right p-2">الطالب</th>
            <th className="text-right p-2">المحفوظ عند البدء</th>
            <th className="text-right p-2">المستهدف</th>
            <th className="text-right p-2">المُنجَز</th>
            <th className="text-right p-2 print:hidden">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {slice.items.map((t) => (
            <tr key={t.student_id} className="border-t">
              <td className="p-2">{t.full_name_ar}</td>
              <td className="p-2 tabular-nums">
                {memorizationLabel(t.current_memorization)}
              </td>
              <td className="p-2 tabular-nums">
                {editingTargetId === t.student_id ? (
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={editTargetAmount}
                    onChange={(e) => onEditTargetAmountChange(e.target.value)}
                    className="h-8 w-24"
                  />
                ) : (
                  String(t.target_amount)
                )}
              </td>
              <td className="p-2 tabular-nums">{String(t.achieved_amount ?? 0)}</td>
              <td className="p-2 print:hidden">
                <div className="flex items-center gap-1">
                  {editingTargetId === t.student_id ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        disabled={saving}
                        onClick={() => onSaveEdit(t.student_id)}
                      >
                        حفظ
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={onCancelEdit}
                      >
                        إلغاء
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="تعديل المستهدف"
                        disabled={saving}
                        onClick={() => onStartEdit(t)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="إزالة من المنافسة"
                        disabled={saving}
                        onClick={() => onRemove(t.student_id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {slice.total > slice.page_size && (
        <TablePagination page={slice} onPageChange={setPage} />
      )}
    </>
  );
}
