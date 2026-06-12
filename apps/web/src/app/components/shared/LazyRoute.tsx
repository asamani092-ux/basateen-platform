import { Suspense, type ReactNode } from "react";
import { RouteSectionSkeleton } from "./RouteSectionSkeleton";

/** Wraps lazy route elements with a section skeleton fallback */
export function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteSectionSkeleton />}>{children}</Suspense>;
}
