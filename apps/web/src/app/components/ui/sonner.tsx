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
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
