import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { ds, tajawal } from "../../lib/design-system";

type FeatureShellProps = {
  title: string;
  description: string;
  badge?: string;
  children?: ReactNode;
};

/** هيكل موحّد لصفحات Wave-1 — محتوى لاحقاً */
export function FeatureShell({
  title,
  description,
  badge,
  children,
}: FeatureShellProps) {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          {title}
        </h2>
        <p className={ds.page.description} style={tajawal}>
          {description}
        </p>
        {badge && (
          <p className="text-xs text-muted-foreground mt-2" style={tajawal}>
            {badge}
          </p>
        )}
      </div>
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className="text-foreground" style={tajawal}>
            {title}
          </CardTitle>
          <CardDescription className="text-muted-foreground" style={tajawal}>
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground" style={tajawal}>
          {children ?? (
            <p>
              الصفحة جاهزة في الهيكل — سيتم ربط البيانات والمنطق في مرحلة التطوير
              التالية.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
