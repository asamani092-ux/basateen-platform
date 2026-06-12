import * as React from "react";
import { createContext, useContext, useRef, useState } from "react";

import { isPromiseLike } from "../../lib/guarded-async";

const FormPendingContext = createContext(false);

/** True while the enclosing GuardedForm is processing a submit. */
export function useFormPending(): boolean {
  return useContext(FormPendingContext);
}

type GuardedFormProps = React.ComponentProps<"form"> & {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
};

/** Drop-in replacement for <form> — blocks duplicate submit while onSubmit is in flight. */
function GuardedForm({ onSubmit, children, ...props }: GuardedFormProps) {
  const lockRef = useRef(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!onSubmit) return;
    e.preventDefault();
    if (lockRef.current) return;
    lockRef.current = true;
    setPending(true);
    try {
      const result = onSubmit(e);
      if (isPromiseLike(result)) await result;
    } finally {
      lockRef.current = false;
      setPending(false);
    }
  }

  return (
    <FormPendingContext.Provider value={pending}>
      <form {...props} onSubmit={handleSubmit}>
        {children}
      </form>
    </FormPendingContext.Provider>
  );
}

export { GuardedForm };
