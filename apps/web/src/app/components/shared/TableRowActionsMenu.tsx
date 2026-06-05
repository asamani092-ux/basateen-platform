import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

export type RowActionItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onClick: () => void;
};

type Props = {
  items: RowActionItem[];
  ariaLabel?: string;
};

/**
 * قائمة إجراءات صف — بدون Radix Dropdown لتجنب تعطّل النقر داخل الجداول القابلة للتمرير.
 * Time O(1) per click; Space O(1).
 */
export function TableRowActionsMenu({ items, ariaLabel = "إجراءات" }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function close() {
    setOpen(false);
    setPos(null);
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 224;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    setPos({ top: rect.bottom + 4, left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className={cn(ds.btnRound, "h-8 w-8")}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
      >
        <MoreHorizontal className="w-4 h-4" />
      </Button>
      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              dir="rtl"
              className="fixed z-[9999] min-w-[14rem] rounded-xl border border-border bg-popover text-popover-foreground shadow-lg py-1 text-right pointer-events-auto"
              style={{ top: pos.top, left: pos.left, ...tajawal }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {items.map((item, idx) => {
                const prev = items[idx - 1];
                const showSep = item.destructive && prev && !prev.destructive;
                return (
                  <div key={item.id}>
                    {showSep ? <div className="my-1 border-t border-border" /> : null}
                    <button
                      type="button"
                      role="menuitem"
                      className={cn(
                        "flex w-full items-center justify-end gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted",
                        item.destructive && "text-destructive hover:bg-destructive/10",
                      )}
                      style={tajawal}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        close();
                        item.onClick();
                      }}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
