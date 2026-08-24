import { useEffect, useRef } from "react";

/** Fecha um Dialog automaticamente quando uma server action (via useActionState)
 * termina sem erro. Evita fechar em falha de validação. */
export function useCloseOnSuccess(
  pending: boolean,
  hasError: boolean,
  close: () => void
) {
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !hasError) {
      close();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, hasError]);
}
