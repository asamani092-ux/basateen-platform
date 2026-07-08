import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { isPromiseLike } from "../../lib/guarded-async";
import { cn } from "./utils";
import { useFormPending } from "./guarded-form";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-input bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2 has-[>svg]:px-4",
        sm: "h-9 rounded-xl gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-xl px-6 has-[>svg]:px-4",
        icon: "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading,
  disabled,
  type,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  const formPending = useFormPending();
  const clickLockRef = React.useRef(false);
  const [clickPending, setClickPending] = React.useState(false);

  const isSubmitBusy = type === "submit" && formPending;
  const isBusy = Boolean(loading || clickPending || isSubmitBusy);

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!onClick || disabled || isBusy || clickLockRef.current) return;
      const result = onClick(e);
      if (!isPromiseLike(result)) return;
      clickLockRef.current = true;
      setClickPending(true);
      Promise.resolve(result).finally(() => {
        clickLockRef.current = false;
        setClickPending(false);
      });
    },
    [onClick, disabled, isBusy],
  );

  return (
    <Comp
      data-slot="button"
      type={type}
      disabled={disabled || isBusy}
      aria-busy={isBusy || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={onClick ? handleClick : undefined}
      {...props}
    >
      {isBusy ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
