import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Archive,
  CheckCircle2,
  Copy,
  Eye,
  FileWarning,
  Gauge,
  MessageCircle,
  Pause,
  Pencil,
  Printer,
  Trash2,
  UserMinus,
  XCircle,
  ArrowLeftRight,
  Link2,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";
import { TableCell } from "../ui/table";

const ACTION_STYLES: Record<
  string,
  { Icon: LucideIcon; label: string; className: string }
> = {
  edit: {
    Icon: Pencil,
    label: "تعديل",
    className: "text-muted-foreground hover:text-foreground hover:bg-muted",
  },
  freeze: {
    Icon: Pause,
    label: "تجميد / حذف",
    className: "text-amber-600 hover:text-amber-700 hover:bg-amber-500/15",
  },
  delete: {
    Icon: Trash2,
    label: "حذف",
    className: "text-destructive hover:bg-destructive/10",
  },
  copy: {
    Icon: Copy,
    label: "نسخ",
    className: "text-muted-foreground hover:text-foreground hover:bg-muted",
  },
  view: {
    Icon: Eye,
    label: "عرض",
    className: "text-muted-foreground hover:text-foreground hover:bg-muted",
  },
  capacity: {
    Icon: Gauge,
    label: "تعديل السعة",
    className: "text-muted-foreground hover:text-foreground hover:bg-muted",
  },
  accept: {
    Icon: CheckCircle2,
    label: "توجيه وقبول",
    className: "text-primary hover:bg-primary/10",
  },
  reject: {
    Icon: XCircle,
    label: "رفض / أرشفة",
    className: "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
  },
  violation: {
    Icon: FileWarning,
    label: "تسجيل مخالفة",
    className: "text-amber-600 hover:bg-amber-500/15",
  },
  archive: {
    Icon: Archive,
    label: "أرشفة التعهد",
    className: "text-muted-foreground hover:text-foreground hover:bg-muted",
  },
  suspend: {
    Icon: Pause,
    label: "تعليق",
    className: "text-amber-600 hover:bg-amber-500/15",
  },
  dismiss: {
    Icon: UserMinus,
    label: "فصل",
    className: "text-destructive hover:bg-destructive/10",
  },
  transfer: {
    Icon: ArrowLeftRight,
    label: "نقل",
    className: "text-muted-foreground hover:text-foreground hover:bg-muted",
  },
  assign: {
    Icon: Link2,
    label: "إسناد",
    className: "text-primary hover:bg-primary/10",
  },
  print: {
    Icon: Printer,
    label: "طباعة النموذج",
    className: "text-muted-foreground hover:text-foreground hover:bg-muted",
  },
  whatsapp: {
    Icon: MessageCircle,
    label: "إرسال واتساب",
    className: "text-primary hover:bg-primary/10",
  },
  more: {
    Icon: MoreHorizontal,
    label: "إجراءات",
    className: "text-muted-foreground hover:text-foreground hover:bg-muted",
  },
};

export type TableIconActionKind = keyof typeof ACTION_STYLES;

type TableIconActionProps = {
  kind: TableIconActionKind;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** للروابط (واتساب) */
  href?: string;
};

export function TableIconAction({
  kind,
  label,
  onClick,
  disabled,
  href,
}: TableIconActionProps) {
  const { Icon, label: defaultLabel, className } = ACTION_STYLES[kind];
  const title = label ?? defaultLabel;

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      className={cn("size-8", ds.btnRound, className)}
      onClick={onClick}
      asChild={Boolean(href)}
    >
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Icon className="size-4" />
          <span className="sr-only">{title}</span>
        </a>
      ) : (
        <>
          <Icon className="size-4" />
          <span className="sr-only">{title}</span>
        </>
      )}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" style={tajawal}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
}

export function TableActionsCell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <TableCell
      className={wide ? ds.table.actionsCellWide : ds.table.actionsCell}
    >
      <div
        className={
          wide ? ds.table.actionsWrapWide : ds.table.actionsWrap
        }
      >
        {children}
      </div>
    </TableCell>
  );
}
