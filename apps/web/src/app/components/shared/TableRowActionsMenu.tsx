import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
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
 * قائمة إجراءات صف — portal + fixed (بدون Radix).
 * Time O(1) per click; Space O(1).
 */
export function TableRowActionsMenu({ items, ariaLabel = "إجراءات" }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function close() {
    setOpen(false);
    setPos(null);
  }

  function openAt(trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 224;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    setPos({ top: rect.bottom + 4, left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
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
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        className={cn(
          ds.btnRound,
          "inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
        )}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) {
            close();
            return;
          }
          openAt(e.currentTarget);
        }}
      >
        <MoreHorizontal className="w-4 h-4 pointer-events-none" />
      </button>
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
    </div>
  );
}
