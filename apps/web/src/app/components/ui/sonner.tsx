"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      richColors
      toastOptions={{
        classNames: {
          toast:
            "rounded-2xl border border-border bg-card text-card-foreground shadow-lg",
          title: "text-sm font-semibold text-right",
          description: "text-sm text-muted-foreground text-right",
          actionButton: "rounded-xl bg-primary text-primary-foreground",
          cancelButton: "rounded-xl bg-muted text-foreground",
          success:
            "rounded-2xl border border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400/45 dark:bg-emerald-500/15 dark:text-emerald-100 [&_[data-title]]:text-emerald-900 dark:[&_[data-title]]:text-emerald-100",
          error:
            "rounded-2xl border border-destructive/50 bg-destructive/10 text-destructive dark:border-destructive/45 dark:bg-destructive/15 dark:text-red-200 [&_[data-title]]:text-destructive dark:[&_[data-title]]:text-red-200",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "color-mix(in oklab, var(--color-emerald-500) 12%, var(--card))",
          "--error-bg": "color-mix(in oklab, var(--destructive) 12%, var(--card))",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
