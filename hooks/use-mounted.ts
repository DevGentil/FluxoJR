import { useSyncExternalStore } from "react";

/** Nada muda depois da montagem, então não há o que assinar. */
const noopSubscribe = () => () => {};

/** `false` no servidor e durante a hidratação, `true` depois dela.
 *
 * Serve para adiar o que só existe no browser (o tema já resolvido, o
 * tamanho da viewport) sem cair no `setState` dentro de `useEffect`, que
 * dispara um render extra em cascata a cada montagem. */
export function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
