import { useCallback, useRef, useState } from "react";

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * Prevents concurrent runs of the same async handler (double-click / double-submit).
 * Time O(1) per invocation; Space O(1).
 */
export function useGuardedAsync<T extends (...args: never[]) => unknown>(
  fn: T,
): { run: T; pending: boolean } {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const lockRef = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    ((...args: Parameters<T>) => {
      if (lockRef.current) return undefined;
      lockRef.current = true;
      setPending(true);
      try {
        const result = fnRef.current(...args);
        if (isPromiseLike(result)) {
          return result.finally(() => {
            lockRef.current = false;
            setPending(false);
          });
        }
        lockRef.current = false;
        setPending(false);
        return result;
      } catch (err) {
        lockRef.current = false;
        setPending(false);
        throw err;
      }
    }) as T,
    [],
  );

  return { run, pending };
}

/** For onClick={() => void action()} — sync wrapper that guards the async body. */
export function useGuardedVoidAction(fn: () => void | Promise<void>): {
  run: () => void;
  pending: boolean;
} {
  const { run, pending } = useGuardedAsync(fn);
  return {
    run: useCallback(() => {
      void run();
    }, [run]),
    pending,
  };
}
