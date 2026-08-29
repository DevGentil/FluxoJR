import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/** Lê o matchMedia direto via `useSyncExternalStore`, em vez de copiar o
 * valor para um estado dentro de um efeito — o que fazia toda montagem
 * renderizar duas vezes. No servidor não existe viewport, então o snapshot
 * é `false`: o layout de desktop, que é o padrão. */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  )
}
