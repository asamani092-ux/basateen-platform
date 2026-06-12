"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";
import { ds } from "../../lib/design-system";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      toastOptions={{
        classNames: {
          toast: ds.toast.base,
          title: ds.toast.title,
          description: ds.toast.description,
          actionButton: "rounded-xl bg-primary text-primary-foreground",
          cancelButton: "rounded-xl bg-muted text-foreground",
          success: `${ds.toast.base} ${ds.toast.success}`,
          error: `${ds.toast.base} ${ds.toast.error}`,
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
